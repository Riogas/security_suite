const express = require('express');
const { query } = require('../db/as400');
const { requiereApiKey } = require('../middleware/apiKey');
const router = express.Router();

// Todo el router va detrás de api-key: estos endpoints exponen el padrón de
// usuarios de la empresa. No confundir con /api/db/query, que sigue abierto
// (deuda anotada aparte).
router.use(requiereApiKey('USERS_API_KEY'));

/**
 * POST /api/users/sgm/list
 * Enumera GXICAGEO.USUMOBILE con su agencia/escenario/fletera y sus roles.
 * NO devuelve USUMOBILEPASSWORD.
 * Body: { soloHabilitados?: boolean }
 */
router.post('/sgm/list', async (req, res) => {
  const { soloHabilitados = true } = req.body || {};
  const filtro = soloHabilitados ? "WHERE TRIM(u.USUMOBILEHABILITADO) = 'S'" : '';

  try {
    const rows = await query(
      `SELECT TRIM(u.USUMOBILELOGIN) AS L,
              TRIM(u.USUMOBILENOMBRE) AS N,
              u.USUMOBILEEMAIL AS E,
              u.USUMOBILEHABILITADO AS HAB,
              a.ESCENARIOID AS ESCID,
              TRIM(e.ESCENARIONOM) AS ESCNOM,
              a.AGENCIAVINCEMPFLT AS EFLID,
              TRIM(ef.EFLNOM) AS EFLNOM
         FROM GXICAGEO.USUMOBILE u
         LEFT JOIN GXICAGEO.AGENCIA a  ON a.AGENCIAID = u.AGENCIAID
         LEFT JOIN GXICAGEO.ESCENARIO e ON e.ESCENARIOID = a.ESCENARIOID
         LEFT JOIN GXCALDTA.EFLETERA ef ON ef.EFLID = a.AGENCIAVINCEMPFLT AND a.AGENCIAVINCEMPFLT > 0
         ${filtro}
        ORDER BY u.USUMOBILELOGIN`,
    );

    // Los roles van en una query aparte y se pegan en memoria: hacerlo con un
    // JOIN multiplicaría las filas de usuario por cantidad de roles.
    const roles = await query(
      `SELECT r.USUMOBILEID AS ID, r.USUMOBR_ROLID AS ROLID
         FROM GXICAGEO.USUMOBILEROLES r`,
    );
    const porLogin = new Map();
    const ids = await query(
      `SELECT u.USUMOBILEID AS ID, TRIM(u.USUMOBILELOGIN) AS L FROM GXICAGEO.USUMOBILE u`,
    );
    const loginPorId = new Map(ids.map((r) => [String(r.ID), r.L]));
    for (const r of roles) {
      const login = loginPorId.get(String(r.ID));
      if (!login) continue;
      if (!porLogin.has(login)) porLogin.set(login, []);
      porLogin.get(login).push(Number(r.ROLID));
    }

    const conRoles = rows.map((r) => ({ ...r, ROLES: porLogin.get(r.L) || [] }));
    console.log(`[Users SGM] ${conRoles.length} usuarios (soloHabilitados=${soloHabilitados})`);
    res.json({ ok: true, rows: conRoles });
  } catch (err) {
    console.error('[Users SGM] Error:', err.message);
    res.status(500).json({ ok: false, outcome: 'UNAVAILABLE', error: 'Error consultando USUMOBILE' });
  }
});

/**
 * POST /api/users/admsec/list
 * Enumera ADMSEC.USUARIOS con sus GRPIDs. NO devuelve USUPASSWORD.
 * Esta tabla NO tiene nombre ni email — es esperado, no un bug.
 * Body: { soloHabilitados?: boolean }
 */
router.post('/admsec/list', async (req, res) => {
  const { soloHabilitados = true } = req.body || {};
  const filtro = soloHabilitados ? "WHERE TRIM(u.USUHABILITADO) = 'S'" : '';

  try {
    const rows = await query(
      `SELECT u.USUID AS ID, TRIM(u.USULOGIN) AS L, u.USUHABILITADO AS HAB, u.USUAUTAD AS AUTAD
         FROM ADMSEC.USUARIOS u
         ${filtro}
        ORDER BY u.USULOGIN`,
    );

    const grupos = await query(`SELECT USUID AS ID, GRPID FROM ADMSEC.GRPUSU`);
    const porId = new Map();
    for (const g of grupos) {
      const k = String(g.ID);
      if (!porId.has(k)) porId.set(k, []);
      porId.get(k).push(Number(g.GRPID));
    }

    const conGrupos = rows.map(({ ID, ...r }) => ({ ...r, GRUPOS: porId.get(String(ID)) || [] }));
    console.log(`[Users ADMSEC] ${conGrupos.length} usuarios (soloHabilitados=${soloHabilitados})`);
    res.json({ ok: true, rows: conGrupos });
  } catch (err) {
    console.error('[Users ADMSEC] Error:', err.message);
    res.status(500).json({ ok: false, outcome: 'UNAVAILABLE', error: 'Error consultando ADMSEC' });
  }
});

/**
 * POST /api/users/ldap/list
 * Enumera Active Directory. Requiere una cuenta de servicio de solo lectura
 * (LDAP_BIND_USER / LDAP_BIND_PASSWORD), que al 2026-08-17 NO existe: sin ella
 * no se puede hacer search sobre el árbol, solo bind con la clave del propio
 * usuario. Mientras tanto responde NO_SERVICE_ACCOUNT y secapi cae a ADMSEC.
 *
 * Cuando se provisione la cuenta, implementar acá el bind + search por
 * (&(objectCategory=person)(objectClass=user)) sobre LDAP_BASE_DN, pidiendo
 * sAMAccountName, displayName, mail y userAccountControl.
 */
router.post('/ldap/list', async (req, res) => {
  if (!process.env.LDAP_BIND_USER || !process.env.LDAP_BIND_PASSWORD) {
    console.warn('[Users LDAP] sin service account: devolviendo NO_SERVICE_ACCOUNT');
    return res.json({
      ok: false,
      outcome: 'UNAVAILABLE',
      reason: 'NO_SERVICE_ACCOUNT',
      error: 'Falta la cuenta de servicio de Active Directory (LDAP_BIND_USER / LDAP_BIND_PASSWORD)',
    });
  }

  return res.status(501).json({
    ok: false,
    outcome: 'UNAVAILABLE',
    reason: 'NO_IMPLEMENTADO',
    error: 'La cuenta de servicio está configurada pero el search contra AD todavía no se implementó',
  });
});

module.exports = router;
