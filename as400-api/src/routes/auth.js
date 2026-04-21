const express = require('express');
const ldap = require('ldapjs');
const { twofish } = require('twofish');
const { query } = require('../db/as400');
const router = express.Router();

const ENCRYPT_KEY = process.env.AS400_ENCRYPT_KEY || 'e57bfc8ea91ab3e2f1201b5b3612eea2';

// GeneXus Encrypt64: Twofish-128-ECB, key en hex (16 bytes), space padding (0x20), resultado en Base64
function encrypt64(text, hexKey) {
  const tf = twofish();
  const key = Array.from(Buffer.from(hexKey, 'hex'));
  const input = Array.from(Buffer.from(text.trim(), 'utf8'));
  const blockSize = 16;
  const paddedLen = Math.max(blockSize, Math.ceil(input.length / blockSize) * blockSize);
  const padded = [...input, ...Array(paddedLen - input.length).fill(0x20)];
  const output = [];
  for (let i = 0; i < padded.length; i += blockSize) {
    output.push(...tf.encrypt(key, padded.slice(i, i + blockSize)));
  }
  return Buffer.from(output).toString('base64').trim();
}

/**
 * POST /api/auth/as400
 * Valida credenciales contra la tabla GXICAGEO.USUMOBILE del AS400.
 * Body: { username, password }
 */
router.post('/as400', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'username y password son requeridos' });
  }

  console.log(`🔐 [AS400 Auth] Buscando usuario: ${username}`);

  try {
    const rows = await query(
      `SELECT u.USUMOBILEID, u.USUMOBILENOMBRE, u.USUMOBILEEMAIL,
              u.USUMOBILEPASSWORD, u.USUMOBILEHABILITADO,
              r.USUMOBR_ROLID
       FROM GXICAGEO.USUMOBILE u
       LEFT JOIN GXICAGEO.USUMOBILEROLES r
         ON r.USUMOBILEID = u.USUMOBILEID AND r.USUMOBR_ROLID = 6
       WHERE UPPER(TRIM(u.USUMOBILELOGIN)) = UPPER(?)`,
      [username.trim()]
    );

    if (rows.length === 0) {
      console.log(`❌ [AS400 Auth] Usuario ${username} no encontrado`);
      return res.json({ success: false, message: 'Usuario no encontrado' });
    }

    const row = rows[0];

    if (row.USUMOBILEHABILITADO !== 'S') {
      return res.json({ success: false, message: 'Usuario deshabilitado en SGM' });
    }

    const storedPassword = (row.USUMOBILEPASSWORD || '').trim();
    const encryptedInput = encrypt64(password, ENCRYPT_KEY);

    if (encryptedInput !== storedPassword) {
      console.log(`❌ [AS400 Auth] Contraseña incorrecta para ${username}`);
      return res.json({ success: false, message: 'Credenciales inválidas' });
    }

    const hasRoleDespacho = row.USUMOBR_ROLID === 6;
    console.log(`✅ [AS400 Auth] ${username} autenticado. Despacho: ${hasRoleDespacho}`);

    res.json({
      success: true,
      user: {
        username: username.trim(),
        nombre: (row.USUMOBILENOMBRE || '').trim() || username.trim(),
        email: (row.USUMOBILEEMAIL || '').trim(),
        hasRoleDespacho,
      },
    });
  } catch (err) {
    console.error('❌ [AS400 Auth] Error:', err.message);
    res.status(500).json({ success: false, message: 'Error interno consultando AS400' });
  }
});

const LDAP_HOST = process.env.LDAP_HOST || '192.168.1.7';
const LDAP_PORT = parseInt(process.env.LDAP_PORT || '389', 10);
const LDAP_DOMAIN = process.env.LDAP_DOMAIN || 'glp';
const LDAP_BASE_DN = process.env.LDAP_BASE_DN || 'DC=glp,DC=riogas,DC=com,DC=uy';
const LDAP_GROUP_DESPACHO = process.env.LDAP_GROUP_DESPACHO || '52';

/**
 * POST /api/auth/ldap
 * Valida credenciales contra Active Directory via LDAP.
 * Body: { username, password }
 * Respuesta: { success, user: { username, email, nombre, department, groups, isDespacho } }
 */
router.post('/ldap', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'username y password son requeridos' });
  }

  console.log(`🔐 [LDAP] Autenticando usuario: ${username}`);

  try {
    const result = await authenticateLDAP(username, password);
    if (result.success) {
      console.log(`✅ [LDAP] ${username} autenticado. Despacho: ${result.user.isDespacho}`);
    } else {
      console.log(`❌ [LDAP] ${username}: ${result.message}`);
    }
    res.json(result);
  } catch (err) {
    console.error('❌ [LDAP] Error inesperado:', err.message);
    res.status(500).json({ success: false, message: 'Error interno en autenticación LDAP' });
  }
});

function authenticateLDAP(username, password) {
  return new Promise((resolve) => {
    const client = ldap.createClient({
      url: `ldap://${LDAP_HOST}:${LDAP_PORT}`,
      timeout: 5000,
      connectTimeout: 5000,
    });

    client.on('error', (err) => {
      resolve({ success: false, message: `Error de conexión LDAP: ${err.message}` });
    });

    const bindDN = `${LDAP_DOMAIN}\\${username}`;

    client.bind(bindDN, password, (bindErr) => {
      if (bindErr) {
        client.destroy();
        return resolve({ success: false, message: 'Credenciales inválidas' });
      }

      client.search(LDAP_BASE_DN, {
        filter: `(sAMAccountName=${username})`,
        scope: 'sub',
        attributes: ['cn', 'mail', 'displayName', 'memberOf', 'department', 'title', 'sAMAccountName'],
      }, (searchErr, searchRes) => {
        if (searchErr) {
          client.unbind();
          return resolve({
            success: true,
            user: { username, email: '', nombre: username, department: '', title: '', groups: [], isDespacho: false },
          });
        }

        let userData = null;

        searchRes.on('searchEntry', (entry) => {
          const attrs = {};
          entry.pojo.attributes.forEach(attr => { attrs[attr.type] = attr.values; });

          const memberOf = attrs.memberOf || [];
          const groupCNs = memberOf.map(dn => {
            const match = dn.match(/^CN=([^,]+)/i);
            return match ? match[1] : dn;
          });

          userData = {
            username: attrs.sAMAccountName?.[0] || username,
            email: attrs.mail?.[0] || '',
            nombre: attrs.displayName?.[0] || attrs.cn?.[0] || username,
            department: attrs.department?.[0] || '',
            title: attrs.title?.[0] || '',
            groups: groupCNs,
            isDespacho: groupCNs.some(cn => cn === LDAP_GROUP_DESPACHO),
          };
        });

        searchRes.on('error', () => {});

        searchRes.on('end', () => {
          client.unbind();
          if (!userData) {
            userData = { username, email: '', nombre: username, department: '', title: '', groups: [], isDespacho: false };
          }
          resolve({ success: true, user: userData });
        });
      });
    });
  });
}

module.exports = router;
