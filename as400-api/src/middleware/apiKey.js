const crypto = require('crypto');

/**
 * Middleware de api-key para el router /api/ficha.
 *
 * Compara el header `x-api-key` contra process.env.FICHA_API_KEY con
 * timingSafeEqual (comparando largos antes, porque timingSafeEqual tira
 * si los buffers miden distinto).
 *
 * No se aplica a ninguna ruta existente: solo lo monta /api/ficha.
 */
function requiereApiKey(req, res, next) {
  const esperada = process.env.FICHA_API_KEY;

  if (!esperada) {
    console.error('[Ficha] FICHA_API_KEY no está definida: /api/ficha queda bloqueado');
    return res.status(500).json({
      ok: false,
      error: 'FICHA_API_KEY no está configurada en el servidor. Definila en el .env de as400-api y reiniciá el proceso.',
    });
  }

  const recibida = req.get('x-api-key') || '';
  const bufRecibida = Buffer.from(recibida, 'utf8');
  const bufEsperada = Buffer.from(esperada, 'utf8');

  if (bufRecibida.length !== bufEsperada.length || !crypto.timingSafeEqual(bufRecibida, bufEsperada)) {
    console.warn(`[Ficha] api-key inválida en ${req.method} ${req.originalUrl}`);
    return res.status(401).json({ ok: false, error: 'API key inválida o ausente (header x-api-key)' });
  }

  return next();
}

module.exports = { requiereApiKey };
