require('dotenv').config();
const jt400 = require('node-jt400');

let pool = null;
let poolFicha = null;

function getPool() {
  if (!pool) {
    pool = jt400.pool({
      host:      process.env.AS400_HOST,
      user:      process.env.AS400_USER,
      password:  process.env.AS400_PASSWORD,
      libraries: process.env.AS400_LIBRARIES
        ? process.env.AS400_LIBRARIES.split(',').map(l => l.trim())
        : [],
    });
    console.log(`[AS400] Pool conectado a ${process.env.AS400_HOST}`);
  }
  return pool;
}

/**
 * Pool dedicado de la ficha (usuario AS400 con permisos mínimos).
 * Si AS400_FICHA_USER / AS400_FICHA_PASSWORD no están definidas, cae al pool
 * general para no dejar la ficha sin servicio hasta que se cree el usuario.
 */
function getPoolFicha() {
  const user     = process.env.AS400_FICHA_USER;
  const password = process.env.AS400_FICHA_PASSWORD;

  if (!user || !password) return getPool();

  if (!poolFicha) {
    poolFicha = jt400.pool({
      host:      process.env.AS400_HOST,
      user,
      password,
      libraries: process.env.AS400_LIBRARIES
        ? process.env.AS400_LIBRARIES.split(',').map(l => l.trim())
        : [],
    });
    console.log(`[AS400] Pool ficha (usuario ${user}) conectado a ${process.env.AS400_HOST}`);
  }
  return poolFicha;
}

async function query(sql, params = []) {
  return getPool().query(sql, params);
}

async function execute(sql, params = []) {
  return getPool().execute(sql, params);
}

async function update(sql, params = []) {
  return getPool().update(sql, params);
}

async function queryFicha(sql, params = []) {
  return getPoolFicha().query(sql, params);
}

async function updateFicha(sql, params = []) {
  return getPoolFicha().update(sql, params);
}

async function testConexion() {
  try {
    await query('SELECT 1 FROM SYSIBM.SYSDUMMY1');
    return true;
  } catch (err) {
    console.error('[AS400] Error de conexión:', err.message);
    return false;
  }
}

module.exports = { query, execute, update, testConexion, getPoolFicha, queryFicha, updateFicha };
