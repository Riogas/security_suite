const router = require('express').Router();
const { query, update } = require('../db/as400');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/clientes?codigo=&nombre=&limit=
router.get('/', asyncHandler(async (req, res) => {
  const { codigo, nombre, limit = 50 } = req.query;
  const params = [];
  let sql = `SELECT * FROM CLIENTES WHERE 1=1`;

  if (codigo) { sql += ` AND CODCLI = ?`; params.push(codigo); }
  if (nombre)  { sql += ` AND UPPER(NOMCLI) LIKE ?`; params.push(`%${nombre.toUpperCase()}%`); }
  sql += ` FETCH FIRST ${parseInt(limit)} ROWS ONLY`;

  const rows = await query(sql, params);
  res.json({ ok: true, rows, count: rows.length });
}));

// GET /api/clientes/:codigo
router.get('/:codigo', asyncHandler(async (req, res) => {
  const rows = await query(`SELECT * FROM CLIENTES WHERE CODCLI = ?`, [req.params.codigo]);
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
  res.json({ ok: true, data: rows[0] });
}));

// PUT /api/clientes/:codigo — actualización parcial
router.put('/:codigo', asyncHandler(async (req, res) => {
  const campos = req.body;
  const sets = Object.keys(campos).map(k => `${k} = ?`).join(', ');
  const valores = [...Object.values(campos), req.params.codigo];

  if (!sets) return res.status(400).json({ ok: false, error: 'Sin campos para actualizar' });

  const afectados = await update(
    `UPDATE CLIENTES SET ${sets} WHERE CODCLI = ?`,
    valores
  );
  res.json({ ok: true, afectados });
}));

module.exports = router;
