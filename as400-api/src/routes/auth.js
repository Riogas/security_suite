const express = require('express');
const ldap = require('ldapjs');
const { EqualityFilter } = ldap;
const { query } = require('../db/as400');
const { encrypt64 } = require('../lib/encrypt64');
const router = express.Router();

const ENCRYPT_KEY = process.env.AS400_ENCRYPT_KEY || 'e57bfc8ea91ab3e2f1201b5b3612eea2';

/**
 * POST /api/auth/as400
 * Valida credenciales contra la tabla GXICAGEO.USUMOBILE del AS400.
 * Body: { username, password }
 * Respuesta: { outcome: OK | INVALID_CREDS | NOT_FOUND | DISABLED | UNAVAILABLE, success, user?, message? }
 *   - success se mantiene por compatibilidad con consumidores legacy.
 */
router.post('/as400', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ outcome: 'UNAVAILABLE', success: false, message: 'username y password son requeridos' });
  }

  console.log(`[AS400 Auth] Buscando usuario: ${username}`);

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
      console.log(`[AS400 Auth] Usuario ${username} no encontrado`);
      return res.json({ outcome: 'NOT_FOUND', success: false, message: 'Usuario no encontrado' });
    }

    const row = rows[0];

    if (row.USUMOBILEHABILITADO !== 'S') {
      return res.json({ outcome: 'DISABLED', success: false, message: 'Usuario deshabilitado en SGM' });
    }

    const storedPassword = (row.USUMOBILEPASSWORD || '').trim();
    const encryptedInput = encrypt64(password, ENCRYPT_KEY);

    if (encryptedInput !== storedPassword) {
      console.log(`[AS400 Auth] Contraseña incorrecta para ${username}`);
      return res.json({ outcome: 'INVALID_CREDS', success: false, message: 'Credenciales inválidas' });
    }

    const hasRoleDespacho = row.USUMOBR_ROLID === 6;
    console.log(`[AS400 Auth] ${username} autenticado. Despacho: ${hasRoleDespacho}`);

    res.json({
      outcome: 'OK',
      success: true,
      user: {
        username: username.trim(),
        nombre: (row.USUMOBILENOMBRE || '').trim() || username.trim(),
        email: (row.USUMOBILEEMAIL || '').trim(),
        hasRoleDespacho,
      },
    });
  } catch (err) {
    console.error('[AS400 Auth] Error:', err.message);
    res.status(500).json({ outcome: 'UNAVAILABLE', success: false, message: 'Error interno consultando AS400' });
  }
});

const LDAP_HOST = process.env.LDAP_HOST || '192.168.1.7';
const LDAP_PORT = parseInt(process.env.LDAP_PORT || '389', 10);
const LDAP_DOMAIN = process.env.LDAP_DOMAIN || 'glp';
const LDAP_BASE_DN = process.env.LDAP_BASE_DN || 'DC=glp,DC=riogas,DC=com,DC=uy';
// GRPID en AS400 ADMSEC.GRPUSU que representa "Despacho".
// Mantenemos el nombre LDAP_GROUP_DESPACHO por compatibilidad de env.
const AS400_GRUPO_DESPACHO_ID = parseInt(process.env.AS400_GRUPO_DESPACHO_ID || process.env.LDAP_GROUP_DESPACHO || '52', 10);

/**
 * Verifica en AS400 (ADMSEC) si el usuario pertenece al grupo Despacho.
 * Une ADMSEC.USUARIOS (USULOGIN) con ADMSEC.GRPUSU (USUID, GRPID).
 * Devuelve false si AS400 está caído o el usuario no existe en ADMSEC.
 */
async function isDespachoEnAS400(username, grpId) {
  try {
    const rows = await query(
      `SELECT 1 AS X
         FROM ADMSEC.USUARIOS u
         INNER JOIN ADMSEC.GRPUSU g ON g.USUID = u.USUID
        WHERE UPPER(TRIM(u.USULOGIN)) = UPPER(?) AND g.GRPID = ?
        FETCH FIRST 1 ROWS ONLY`,
      [username.trim(), grpId]
    );
    return rows.length > 0;
  } catch (err) {
    console.warn(`[LDAP->AS400] No se pudo consultar ADMSEC para ${username}: ${err.message}`);
    return false;
  }
}

/**
 * POST /api/auth/ldap
 * Valida credenciales contra Active Directory via LDAP.
 * Body: { username, password }
 * Respuesta: { outcome: OK | INVALID_CREDS | NOT_FOUND | UNAVAILABLE, success, user?, message? }
 *   user = { username, email, nombre, department, groups, isDespacho }
 *
 * Deuda técnica documentada en as400-api/README.md → sección "Deuda técnica conocida".
 * Sin service account (LDAP_BIND_USER / LDAP_BIND_PASSWORD) no podemos hacer
 * search-then-bind, por lo que no podemos distinguir NOT_FOUND de INVALID_CREDS:
 * todo bind fallido se reporta como INVALID_CREDS. Esto degrada AC-02 / AC-14:
 * usuarios marcados con UsuAutAD='A' en ADMSEC.USUARIOS pero ausentes en AD reciben
 * 401 directo en vez de fallback a la validación de password contra ADMSEC.USUARIOS.
 */
router.post('/ldap', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ outcome: 'UNAVAILABLE', success: false, message: 'username y password son requeridos' });
  }

  console.log(`[LDAP] Autenticando usuario: ${username}`);

  try {
    const result = await authenticateLDAP(username, password);
    if (result.outcome === 'OK') {
      console.log(`[LDAP] ${username} autenticado. Despacho: ${result.user.isDespacho}`);
    } else {
      console.log(`[LDAP] ${username}: ${result.message || result.outcome}`);
    }
    res.json(result);
  } catch (err) {
    console.error('[LDAP] Error inesperado:', err.message);
    res.status(500).json({ outcome: 'UNAVAILABLE', success: false, message: 'Error interno en autenticación LDAP' });
  }
});

function authenticateLDAP(username, password) {
  return new Promise((resolve) => {
    const client = ldap.createClient({
      url: `ldap://${LDAP_HOST}:${LDAP_PORT}`,
      timeout: 5000,
      connectTimeout: 5000,
    });

    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    client.on('error', (err) => {
      try { client.destroy(); } catch (_e) { /* ignore */ }
      finish({ outcome: 'UNAVAILABLE', success: false, message: `Error de conexión LDAP: ${err.message}` });
    });

    const bindDN = `${LDAP_DOMAIN}\\${username}`;

    client.bind(bindDN, password, (bindErr) => {
      if (bindErr) {
        try { client.destroy(); } catch (_e) { /* ignore */ }
        // Sin service account no podemos distinguir NOT_FOUND de INVALID_CREDS.
        // Distinguimos solo errores de conexión / servidor (UNAVAILABLE) del resto (INVALID_CREDS).
        const name = bindErr.name || '';
        const isUnavailable =
          name === 'ConnectionError' ||
          name === 'UnavailableError' ||
          name === 'ServerDownError' ||
          name === 'TimeoutError';
        if (isUnavailable) {
          return finish({ outcome: 'UNAVAILABLE', success: false, message: `LDAP no disponible: ${bindErr.message}` });
        }
        return finish({ outcome: 'INVALID_CREDS', success: false, message: 'Credenciales inválidas' });
      }

      client.search(LDAP_BASE_DN, {
        filter: new EqualityFilter({ attribute: 'sAMAccountName', value: username }),
        scope: 'sub',
        attributes: ['cn', 'mail', 'displayName', 'memberOf', 'department', 'title', 'sAMAccountName'],
      }, (searchErr, searchRes) => {
        if (searchErr) {
          client.unbind();
          return finish({
            outcome: 'OK',
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
            isDespacho: false,
          };
        });

        searchRes.on('error', () => {});

        searchRes.on('end', async () => {
          client.unbind();
          if (!userData) {
            userData = { username, email: '', nombre: username, department: '', title: '', groups: [], isDespacho: false };
          }
          userData.isDespacho = await isDespachoEnAS400(userData.username, AS400_GRUPO_DESPACHO_ID);
          console.log(`[LDAP->AS400] ${userData.username} GRPID=${AS400_GRUPO_DESPACHO_ID} -> isDespacho=${userData.isDespacho}`);
          finish({ outcome: 'OK', success: true, user: userData });
        });
      });
    });
  });
}

module.exports = router;
