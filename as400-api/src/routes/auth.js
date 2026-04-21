const express = require('express');
const ldap = require('ldapjs');
const crypto = require('crypto');
const { query } = require('../db/as400');
const router = express.Router();

const ENCRYPT_KEY = process.env.AS400_ENCRYPT_KEY || 'e57bfc8ea91ab3e2f1201b5b3612eea2';

function encrypt64(text, key) {
  const keyBuf = Buffer.alloc(32);
  Buffer.from(key, 'utf8').copy(keyBuf);
  const cipher = crypto.createCipheriv('aes-256-ecb', keyBuf, null);
  return Buffer.concat([cipher.update(Buffer.from(text, 'utf8')), cipher.final()]).toString('base64');
}

function encrypt64Variants(text, key) {
  const input = Buffer.from(text, 'utf8');
  const results = {};
  const md5 = s => crypto.createHash('md5').update(s).digest();
  const sha256 = s => crypto.createHash('sha256').update(s).digest();
  const tryEnc = (algo, k, inp) => {
    try {
      const c = crypto.createCipheriv(algo, k, null);
      return Buffer.concat([c.update(inp), c.final()]).toString('base64');
    } catch { return null; }
  };

  // V1: AES-256, key UTF-8 padded (actual)
  const k256utf8 = Buffer.alloc(32); Buffer.from(key, 'utf8').copy(k256utf8);
  results.v1_aes256_utf8 = tryEnc('aes-256-ecb', k256utf8, input);

  // V2: AES-128, key hex (16 bytes)
  results.v2_aes128_hex = tryEnc('aes-128-ecb', Buffer.from(key, 'hex'), input);

  // V3: AES-256, key hex padded (16+16 zeros)
  const k256hex = Buffer.alloc(32); Buffer.from(key, 'hex').copy(k256hex);
  results.v3_aes256_hex = tryEnc('aes-256-ecb', k256hex, input);

  // V4: AES-128, key MD5-hashed
  results.v4_aes128_md5key = tryEnc('aes-128-ecb', md5(key), input);

  // V5: AES-256, key SHA256-hashed
  results.v5_aes256_sha256key = tryEnc('aes-256-ecb', sha256(key), input);

  // V6: AES-128, key UTF-8 truncated to 16 bytes
  results.v6_aes128_utf8 = tryEnc('aes-128-ecb', Buffer.from(key, 'utf8').slice(0, 16), input);

  // V7: AES-128, key MD5 of utf8 key
  results.v7_aes128_md5utf8 = tryEnc('aes-128-ecb', md5(Buffer.from(key, 'utf8')), input);

  // V8: DOBLE Encrypt64 — Encrypt64(Encrypt64(password, key), key) AES-256 UTF-8
  if (results.v1_aes256_utf8) {
    results.v8_double_aes256_utf8 = tryEnc('aes-256-ecb', k256utf8, Buffer.from(results.v1_aes256_utf8, 'utf8'));
  }

  // V9: DOBLE Encrypt64 — AES-128 hex
  if (results.v2_aes128_hex) {
    results.v9_double_aes128_hex = tryEnc('aes-128-ecb', Buffer.from(key, 'hex'), Buffer.from(results.v2_aes128_hex, 'utf8'));
  }

  return results;
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

    const variants = encrypt64Variants(password, ENCRYPT_KEY);
    console.log(`[AS400 Auth DEBUG] stored(${storedPassword.length}): ${storedPassword.substring(0, 12)}...`);
    Object.entries(variants).forEach(([k, v]) => {
      const match = v === storedPassword ? ' ✅ MATCH' : '';
      console.log(`[AS400 Auth DEBUG] ${k}(${v.length}): ${v.substring(0, 12)}...${match}`);
    });

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

      // Bind exitoso — buscar datos del usuario en AD
      client.search(LDAP_BASE_DN, {
        filter: `(sAMAccountName=${username})`,
        scope: 'sub',
        attributes: ['cn', 'mail', 'displayName', 'memberOf', 'department', 'title', 'sAMAccountName'],
      }, (searchErr, searchRes) => {
        if (searchErr) {
          client.unbind();
          // Bind fue exitoso aunque el search falló — devolver datos mínimos
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

        searchRes.on('error', () => { /* ignorar — ya tenemos el bind exitoso */ });

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
