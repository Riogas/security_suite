require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { testConexion } = require('./src/db/as400');
const { errorHandler } = require('./src/middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ─── Rutas ───────────────────────────────────────────────────────────────────
app.use('/api/db',       require('./src/routes/db'));
app.use('/api/clientes', require('./src/routes/clientes'));
app.use('/api/pedidos',  require('./src/routes/pedidos'));
app.use('/api/ficha',    require('./src/routes/ficha'));
app.use('/api/auth',     require('./src/routes/auth'));
app.use('/api/auth',     require('./src/routes/auth-admsec'));
app.use('/api/users',   require('./src/routes/users'));

app.get('/api/health', async (req, res) => {
  const ok = await testConexion();
  res.status(ok ? 200 : 503).json({ ok, host: process.env.AS400_HOST });
});

app.get('/', (req, res) => res.json({
  servicio: 'AS400 REST API',
  version:  '1.0.0',
  rutas: [
    'GET  /api/health',
    'GET  /api/db/tablas?libreria=',
    'GET  /api/db/columnas?libreria=&tabla=',
    'POST /api/db/query',
    'GET  /api/clientes',
    'GET  /api/clientes/:codigo',
    'PUT  /api/clientes/:codigo',
    'GET  /api/pedidos',
    'GET  /api/pedidos/:nro',
    'PUT  /api/pedidos/:nro/estado',
    'GET   /api/ficha/cliente/:cliid           (x-api-key)',
    'GET   /api/ficha/cliente/:cliid/senales   (x-api-key)',
    'GET   /api/ficha/cliente/:cliid/telefonos (x-api-key)',
    'PATCH /api/ficha/cliente/:cliid           (x-api-key)',
    'POST /api/auth/as400',
    'POST /api/auth/as400/lookup',
    'POST /api/auth/ldap',
    'POST /api/auth/admsec/lookup',
    'POST /api/auth/admsec/validate',
    'POST /api/users/sgm/list                  (x-api-key)',
    'POST /api/users/admsec/list               (x-api-key)',
    'POST /api/users/ldap/list                 (x-api-key)',
  ],
}));

app.use(errorHandler);

// ─── Inicio ──────────────────────────────────────────────────────────────────
async function iniciar() {
  app.listen(PORT, () => {
    console.log(`[AS400 API] ✓ Servidor en http://localhost:${PORT}`);
    console.log(`[AS400 API] ✓ Health: http://localhost:${PORT}/api/health`);
  });

  // Test conexión en background sin bloquear el arranque
  console.log(`\n[AS400 API] Probando conexión a ${process.env.AS400_HOST}...`);
  testConexion().then(ok => {
    console.log(ok ? '[AS400 API] ✓ AS400 conectado' : '[AS400 API] ⚠️  Sin respuesta del AS400');
  });
}

iniciar();
