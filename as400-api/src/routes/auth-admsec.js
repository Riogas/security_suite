const express = require('express');
const { query } = require('../db/as400');
const { encrypt64 } = require('../lib/encrypt64');
const router = express.Router();

const ENCRYPT_KEY = process.env.AS400_ENCRYPT_KEY || 'e57bfc8ea91ab3e2f1201b5b3612eea2';
const AS400_GRUPO_DESPACHO_ID = parseInt(process.env.AS400_GRUPO_DESPACHO_ID || process.env.LDAP_GROUP_DESPACHO || '52', 10);

/**
 * Carga el usuario de ADMSEC.USUARIOS por USULOGIN.
 * Devuelve null si no existe; lanza si la conexión falla.
 */
async function loadAdmsecUser(username) {
  const rows = await query(
    `SELECT u.USUID, TRIM(u.USULOGIN) AS USULOGIN, u.USUPASSWORD,
            u.USUHABILITADO, u.USUAUTAD
       FROM ADMSEC.USUARIOS u
      WHERE UPPER(TRIM(u.USULOGIN)) = UPPER(?)
      FETCH FIRST 1 ROWS ONLY`,
    [username.trim()]
  );
  return rows.length > 0 ? rows[0] : null;
}

async function isDespacho(usuid) {
  try {
    const rows = await query(
      `SELECT 1 AS X
         FROM ADMSEC.GRPUSU
        WHERE USUID = ? AND GRPID = ?
        FETCH FIRST 1 ROWS ONLY`,
      [usuid, AS400_GRUPO_DESPACHO_ID]
    );
    return rows.length > 0;
  } catch (err) {
    console.warn(`[ADMSEC] No se pudo consultar GRPUSU para USUID=${usuid}: ${err.message}`);
    return false;
  }
}

/**
 * Devuelve todos los GRPIDs a los que pertenece el usuario en ADMSEC.GRPUSU.
 * Si la consulta falla, devuelve []. El caller debe interpretarlo como
 * "no se pudo determinar" (no asignar/quitar roles especulativamente).
 */
async function getUserGroups(usuid) {
  try {
    const rows = await query(
      `SELECT GRPID FROM ADMSEC.GRPUSU WHERE USUID = ?`,
      [usuid]
    );
    return rows.map((r) => Number(r.GRPID)).filter((n) => Number.isFinite(n));
  } catch (err) {
    console.warn(`[ADMSEC] No se pudo obtener grupos de USUID=${usuid}: ${err.message}`);
    return [];
  }
}

function normalizeAutAd(value) {
  const v = (value || '').trim().toUpperCase();
  // Cualquier valor distinto a 'A' lo tratamos como 'G' (más seguro: evita autorizar contra LDAP "por error").
  return v === 'A' ? 'A' : 'G';
}

/**
 * POST /api/auth/admsec/lookup
 * Busca un usuario en ADMSEC.USUARIOS sin validar la clave.
 * Body: { username }
 * Respuesta: { outcome: FOUND | NOT_FOUND | DISABLED | UNAVAILABLE, user? }
 *   user = { username, usuAutAd: 'A'|'G', isDespacho }
 */
router.post('/admsec/lookup', async (req, res) => {
  const { username } = req.body || {};
  if (!username) {
    return res.status(400).json({ outcome: 'UNAVAILABLE', message: 'username es requerido' });
  }

  console.log(`[ADMSEC Lookup] ${username}`);

  try {
    const row = await loadAdmsecUser(username);
    if (!row) {
      return res.json({ outcome: 'NOT_FOUND' });
    }
    if ((row.USUHABILITADO || '').trim() !== 'S') {
      return res.json({ outcome: 'DISABLED' });
    }
    const usuAutAd = normalizeAutAd(row.USUAUTAD);
    const groups = await getUserGroups(row.USUID);
    const despacho = groups.includes(AS400_GRUPO_DESPACHO_ID);
    return res.json({
      outcome: 'FOUND',
      user: {
        username: (row.USULOGIN || username).trim(),
        usuAutAd,
        isDespacho: despacho,
        groups,
      },
    });
  } catch (err) {
    console.error('[ADMSEC Lookup] Error:', err.message);
    return res.json({ outcome: 'UNAVAILABLE', message: 'Error consultando ADMSEC' });
  }
});

/**
 * POST /api/auth/admsec/validate
 * Valida la clave de un usuario contra ADMSEC.USUARIOS.USUPASSWORD (Encrypt64).
 * Body: { username, password }
 * Respuesta: { outcome: OK | INVALID_CREDS | NOT_FOUND | DISABLED | UNAVAILABLE, user? }
 *   user = { username, isDespacho }
 */
router.post('/admsec/validate', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ outcome: 'UNAVAILABLE', message: 'username y password son requeridos' });
  }

  console.log(`[ADMSEC Validate] ${username}`);

  try {
    const row = await loadAdmsecUser(username);
    if (!row) {
      return res.json({ outcome: 'NOT_FOUND' });
    }
    if ((row.USUHABILITADO || '').trim() !== 'S') {
      return res.json({ outcome: 'DISABLED' });
    }

    const stored = (row.USUPASSWORD || '').trim();
    const encrypted = encrypt64(password, ENCRYPT_KEY);

    if (encrypted !== stored) {
      console.log(`[ADMSEC Validate] ${username}: clave incorrecta`);
      return res.json({ outcome: 'INVALID_CREDS' });
    }

    const groups = await getUserGroups(row.USUID);
    const despacho = groups.includes(AS400_GRUPO_DESPACHO_ID);
    console.log(`[ADMSEC Validate] ${username}: OK (despacho=${despacho}, groups=[${groups.join(',')}])`);
    return res.json({
      outcome: 'OK',
      user: {
        username: (row.USULOGIN || username).trim(),
        isDespacho: despacho,
        groups,
      },
    });
  } catch (err) {
    console.error('[ADMSEC Validate] Error:', err.message);
    return res.json({ outcome: 'UNAVAILABLE', message: 'Error consultando ADMSEC' });
  }
});

module.exports = router;
