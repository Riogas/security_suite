const router = require('express').Router();
const { query, update } = require('../db/as400');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/pedidos?cliente=&estado=&desde=&hasta=&limit=
router.get('/', asyncHandler(async (req, res) => {
  const { cliente, estado, desde, hasta, limit = 100 } = req.query;
  const params = [];
  let sql = `SELECT * FROM PEDIDOS WHERE 1=1`;

  if (cliente) { sql += ` AND CODCLI = ?`;  params.push(cliente); }
  if (estado)  { sql += ` AND ESTADO = ?`;  params.push(estado); }
  if (desde)   { sql += ` AND FECPED >= ?`; params.push(desde); }
  if (hasta)   { sql += ` AND FECPED <= ?`; params.push(hasta); }
  sql += ` ORDER BY FECPED DESC FETCH FIRST ${parseInt(limit)} ROWS ONLY`;

  const rows = await query(sql, params);
  res.json({ ok: true, rows, count: rows.length });
}));

// GET /api/pedidos/:nro
router.get('/:nro', asyncHandler(async (req, res) => {
  const [cabecera, detalle] = await Promise.all([
    query(`SELECT * FROM PEDIDOS WHERE NROPED = ?`, [req.params.nro]),
    query(`SELECT * FROM DETPED WHERE NROPED = ? ORDER BY NROLIN`, [req.params.nro]),
  ]);
  if (!cabecera.length) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
  res.json({ ok: true, data: { ...cabecera[0], detalle } });
}));

// PUT /api/pedidos/:nro — actualizar estado del pedido
router.put('/:nro/estado', asyncHandler(async (req, res) => {
  const { estado } = req.body;
  if (!estado) return res.status(400).json({ ok: false, error: 'estado requerido' });

  const afectados = await update(
    `UPDATE PEDIDOS SET ESTADO = ? WHERE NROPED = ?`,
    [estado, req.params.nro]
  );
  res.json({ ok: true, afectados });
}));

module.exports = router;
