const router = require('express').Router();
const { query } = require('../db/as400');
const { asyncHandler } = require('../middleware/errorHandler');

// POST /api/db/query — ejecuta una query SQL directa (solo para desarrollo/debug)
router.post('/query', asyncHandler(async (req, res) => {
  const { sql, params } = req.body;
  if (!sql) return res.status(400).json({ ok: false, error: 'sql requerido' });

  const rows = await query(sql, params || []);
  res.json({ ok: true, rows, count: rows.length });
}));

// GET /api/db/tablas — lista tablas de una librería
router.get('/tablas', asyncHandler(async (req, res) => {
  const libreria = req.query.libreria || process.env.AS400_LIBRARIES?.split(',')[0] || 'QGPL';
  const rows = await query(
    `SELECT TABLE_NAME, TABLE_TYPE FROM QSYS2.SYSTABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
    [libreria.trim().toUpperCase()]
  );
  res.json({ ok: true, libreria, rows });
}));

// GET /api/db/columnas — describe columnas de una tabla
router.get('/columnas', asyncHandler(async (req, res) => {
  const { libreria, tabla } = req.query;
  if (!tabla) return res.status(400).json({ ok: false, error: 'tabla requerida' });

  const rows = await query(
    `SELECT COLUMN_NAME, DATA_TYPE, LENGTH, NUMERIC_SCALE, IS_NULLABLE
     FROM QSYS2.SYSCOLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [
      (libreria || process.env.AS400_LIBRARIES?.split(',')[0] || 'QGPL').trim().toUpperCase(),
      tabla.trim().toUpperCase(),
    ]
  );
  res.json({ ok: true, tabla, rows });
}));

module.exports = router;
