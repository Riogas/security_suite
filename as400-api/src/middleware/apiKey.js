const crypto = require('crypto');

/**
 * Middleware de api-key por header `x-api-key`.
 *
 * `requiereApiKey(nombreEnv)` devuelve el middleware que compara contra
 * process.env[nombreEnv] con timingSafeEqual (comparando largos antes, porque
 * timingSafeEqual tira si los buffers miden distinto).
 *
 * Se invoca con FICHA_API_KEY desde /api/ficha y con USERS_API_KEY desde
 * /api/users. No se aplica a los routers viejos.
 */
function requiereApiKey(nombreEnv = 'FICHA_API_KEY') {
  return function (req, res, next) {
    const esperada = process.env[nombreEnv];

    if (!esperada) {
      console.error(`[apiKey] ${nombreEnv} no está definida: la ruta queda bloqueada`);
      return res.status(500).json({
        ok: false,
        error: `${nombreEnv} no está configurada en el servidor. Definila en el .env de as400-api y reiniciá el proceso.`,
      });
    }

    const recibida = req.get('x-api-key') || '';
    const bufRecibida = Buffer.from(recibida, 'utf8');
    const bufEsperada = Buffer.from(esperada, 'utf8');

    if (bufRecibida.length !== bufEsperada.length || !crypto.timingSafeEqual(bufRecibida, bufEsperada)) {
      console.warn(`[apiKey] api-key inválida en ${req.method} ${req.originalUrl}`);
      return res.status(401).json({ ok: false, error: 'API key inválida o ausente (header x-api-key)' });
    }

    return next();
  };
}

module.exports = { requiereApiKey };
