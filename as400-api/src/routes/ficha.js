const router = require('express').Router();
const { queryFicha, updateFicha } = require('../db/as400');
const { asyncHandler } = require('../middleware/errorHandler');
const { requiereApiKey } = require('../middleware/apiKey');
const { columnaSql, validar } = require('../ficha/campos');

// La api-key protege TODO el router (y solo este router).
router.use(requiereApiKey('FICHA_API_KEY'));

// ─── Normalizadores de valores del AS400 ─────────────────────────────────────
// node-jt400 devuelve los valores serializados desde Java: según el tipo de
// columna pueden llegar como número o como string. Todo se normaliza acá.

/** Texto trimeado; null/undefined → ''. */
function texto(valor) {
  return valor == null ? '' : String(valor).trim();
}

/** Texto trimeado, pero '' y '0' (columnas numéricas vacías) → null. */
function textoONull(valor) {
  const limpio = texto(valor);
  if (!limpio || /^0+$/.test(limpio)) return null;
  return limpio;
}

/** Número; null/'' → null. El 0 se conserva como 0. */
function numero(valor) {
  if (valor == null) return null;
  const limpio = typeof valor === 'number' ? valor : Number(String(valor).trim());
  return Number.isFinite(limpio) ? limpio : null;
}

/** Coordenada: acá el 0 significa "sin dato" → null. */
function coordenada(valor) {
  const n = numero(valor);
  return n === null || n === 0 ? null : n;
}

/** Booleano del AS400: 1 / 'S' / 'Y' / 'T' → true. */
function booleano(valor) {
  if (valor == null) return false;
  if (typeof valor === 'boolean') return valor;
  return ['1', 'S', 'Y', 'T', 'TRUE'].includes(String(valor).trim().toUpperCase());
}

/** CHAR(8) YYYYMMDD; vacío o todo ceros → null. */
function fecha8(valor) {
  const limpio = texto(valor);
  if (!/^\d{8}$/.test(limpio) || /^0+$/.test(limpio)) return null;
  return limpio;
}

/**
 * Date → partes de hora de pared (locales).
 * El AS400 guarda hora local, no UTC: usar toISOString() acá correría el valor
 * 3 horas (y con eso el día, en pedidos de la madrugada).
 */
function partesLocales(fecha) {
  const dosDigitos = n => String(n).padStart(2, '0');
  return {
    dia: `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`,
    hora: `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}:${dosDigitos(fecha.getSeconds())}`,
  };
}

/** Fecha de un pedido → 'YYYY-MM-DD'. Acepta Date, 'YYYY-MM-DD…' y 'YYYYMMDD'. */
function fechaIso(valor) {
  if (valor == null) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : partesLocales(valor).dia;
  const limpio = texto(valor);
  if (!limpio || /^0+$/.test(limpio)) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(limpio)) return limpio.slice(0, 10);
  if (/^\d{8}$/.test(limpio)) return `${limpio.slice(0, 4)}-${limpio.slice(4, 6)}-${limpio.slice(6, 8)}`;
  return limpio;
}

/** Timestamp → 'YYYY-MM-DDTHH:MM:SS'. Tolera el formato clásico del AS400 (YYYY-MM-DD-HH.MM.SS). */
function marcaTiempo(valor) {
  if (valor == null) return null;

  let base = valor;
  if (typeof base === 'number') base = new Date(base);
  if (base instanceof Date) {
    if (Number.isNaN(base.getTime())) return null;
    // El AS400 usa 0001-01-01 como "sin dato"; no tiene sentido devolverlo.
    if (base.getFullYear() < 1900) return null;
    const { dia, hora } = partesLocales(base);
    return `${dia}T${hora}`;
  }

  const limpio = texto(base);
  if (!limpio || /^[0.:\-\sT]*$/.test(limpio)) return null;

  const partes = limpio.match(/^(\d{4}-\d{2}-\d{2})[T\s-](\d{2})[.:](\d{2})[.:](\d{2})/);
  if (partes) {
    // El AS400 usa 0001-01-01 como "sin dato"; no tiene sentido devolverlo.
    if (Number(partes[1].slice(0, 4)) < 1900) return null;
    return `${partes[1]}T${partes[2]}:${partes[3]}:${partes[4]}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return Number(limpio.slice(0, 4)) < 1900 ? null : limpio;
  return limpio;
}

/**
 * dryRun del body: solo booleano (se aceptan "true"/"false" para poder probar con curl).
 * Cualquier otro valor es un error y no un ensayo silencioso: si el caller manda
 * `dryRun: 1` esperando no escribir, no puede terminar escribiendo en el AS400.
 */
function interpretarDryRun(valor) {
  if (valor === undefined || valor === null || valor === false || valor === 'false') return { valor: false };
  if (valor === true || valor === 'true') return { valor: true };
  return { error: `dryRun tiene que ser true o false (llegó ${String(JSON.stringify(valor)).slice(0, 40)})` };
}

/** cliid de la URL: entero > 0 o null. */
function parseCliid(valor) {
  const limpio = String(valor == null ? '' : valor).trim();
  if (!/^\d+$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

router.param('cliid', (req, res, next, valor) => {
  const cliid = parseCliid(valor);
  if (cliid === null) {
    const recortado = String(valor == null ? '' : valor).slice(0, 20);
    return res.status(400).json({ ok: false, error: `cliid inválido ("${recortado}"): tiene que ser un entero mayor a 0` });
  }
  req.cliid = cliid;
  return next();
});

// ─── GET /api/ficha/cliente/:cliid ───────────────────────────────────────────
// Nombres de columna tomados del espejo de GXCALDTA.CLIENTE en goya
// (backend/prisma/schema.prisma), que documenta el origen AS400 de cada campo.
// "LOCAL" va delimitado porque es palabra reservada de DB2 for i.
const SQL_CLIENTE = `
  SELECT CLIID, CLINOM, CLIESTADO, CLITPOPID, CLIRUC, CLIMAIL, CLIGCINRO, CLIVIP,
         CLIOBS, CLIOBSCOM, CLIFCHALTA, CLIFCH, CLIULTLLAM, CLIOPINS, CLIOPUPD,
         CALPRINID, NROPUERTA, BIS, APTO, BLOCKSOL, NIVEL, "LOCAL", NROMANZ, KM,
         DIROBS, CALESQ1ID, CALESQ2ID, DIRCORX, DIRCORY, DIRICAX, DIRICAY,
         DIRFCHGEO, ICAMET
    FROM GXCALDTA.CLIENTE
   WHERE CLIID = ?
   FETCH FIRST 1 ROWS ONLY`;

router.get('/cliente/:cliid', asyncHandler(async (req, res) => {
  const rows = await queryFicha(SQL_CLIENTE, [req.cliid]);
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Cliente no encontrado en el AS400' });

  const row = rows[0];

  res.json({
    ok: true,
    data: {
      cliid: numero(row.CLIID),
      nombre: texto(row.CLINOM),
      estado: texto(row.CLIESTADO),
      tipoId: numero(row.CLITPOPID),
      ruc: textoONull(row.CLIRUC),
      email: textoONull(row.CLIMAIL),
      gci: textoONull(row.CLIGCINRO),
      vip: booleano(row.CLIVIP),
      obs: texto(row.CLIOBS),
      obsComercial: texto(row.CLIOBSCOM),
      fechaAlta: fecha8(row.CLIFCHALTA),
      fecha: fecha8(row.CLIFCH),
      ultimaLlamada: marcaTiempo(row.CLIULTLLAM),
      operadorAlta: texto(row.CLIOPINS),
      operadorModificacion: texto(row.CLIOPUPD),
      direccion: {
        calprinid: numero(row.CALPRINID),
        nroPuerta: numero(row.NROPUERTA),
        bis: texto(row.BIS),
        apto: texto(row.APTO),
        blockSolar: texto(row.BLOCKSOL),
        nivel: texto(row.NIVEL),
        local: texto(row.LOCAL),
        nroManzana: texto(row.NROMANZ),
        km: numero(row.KM),
        dirObs: texto(row.DIROBS),
        esq1Id: numero(row.CALESQ1ID),
        esq2Id: numero(row.CALESQ2ID),
        // DIRCORX = LATITUD y DIRCORY = LONGITUD: los nombres X/Y están invertidos en el AS400.
        lat: coordenada(row.DIRCORX),
        lng: coordenada(row.DIRCORY),
        utmX: coordenada(row.DIRICAX),
        utmY: coordenada(row.DIRICAY),
        fechaGeo: fecha8(row.DIRFCHGEO),
        icaMet: numero(row.ICAMET),
      },
    },
  });
}));

// ─── GET /api/ficha/cliente/:cliid/senales ───────────────────────────────────
router.get('/cliente/:cliid/senales', asyncHandler(async (req, res) => {
  const [agregado, ultimo] = await Promise.all([
    queryFicha(
      `SELECT COUNT(*) AS HIST,
              SUM(CASE WHEN PEDFECHAIN >= CURRENT DATE - 12 MONTHS THEN 1 ELSE 0 END) AS ULT12
         FROM GXCALDTA.PEDIDOS
        WHERE CLIID = ?`,
      [req.cliid]
    ),
    // TODO(spec): PEDIDOS no tiene columna de desempate confirmada (nro de pedido),
    // así que ante dos pedidos del mismo día el "último" queda a criterio del motor.
    queryFicha(
      `SELECT PEDFECHAIN, PEDIMPORTE, PRODPRCANT, PRODPRCOD
         FROM GXCALDTA.PEDIDOS
        WHERE CLIID = ?
        ORDER BY PEDFECHAIN DESC
        FETCH FIRST 1 ROWS ONLY`,
      [req.cliid]
    ),
  ]);

  const fila = agregado[0] || {};

  res.json({
    ok: true,
    data: {
      pedidos12m: numero(fila.ULT12) || 0,
      pedidosHist: numero(fila.HIST) || 0,
      ultPedido: ultimo.length
        ? {
            fecha: fechaIso(ultimo[0].PEDFECHAIN),
            importe: numero(ultimo[0].PEDIMPORTE),
            cantidad: numero(ultimo[0].PRODPRCANT),
            producto: texto(ultimo[0].PRODPRCOD),
          }
        : null,
    },
  });
}));

// ─── GET /api/ficha/cliente/:cliid/telefonos ─────────────────────────────────
// Solo lectura en fase 1: la ficha no escribe teléfonos.
router.get('/cliente/:cliid/telefonos', asyncHandler(async (req, res) => {
  const rows = await queryFicha(
    `SELECT TELFNRO, CLITELESTA, CLITELOBS FROM GXCALDTA.TELCLI WHERE CLIID = ?`,
    [req.cliid]
  );

  res.json({
    ok: true,
    // El número va como texto, tal cual lo devuelve el driver: no se lo pasa por
    // Number() para no perder ceros a la izquierda si la columna es de texto.
    rows: rows.map(row => ({
      numero: texto(row.TELFNRO),
      estado: texto(row.CLITELESTA),
      obs: texto(row.CLITELOBS),
    })),
  });
}));

// ─── PATCH /api/ficha/cliente/:cliid ─────────────────────────────────────────
router.patch('/cliente/:cliid', asyncHandler(async (req, res) => {
  const { campos, dryRun } = req.body || {};

  const ensayo = interpretarDryRun(dryRun);
  if (ensayo.error) {
    return res.status(400).json({ ok: false, error: ensayo.error, errores: [ensayo.error] });
  }

  const { ok, limpios, errores } = validar(campos);
  if (!ok) {
    return res.status(400).json({ ok: false, error: 'Hay campos inválidos, no se escribió nada', errores });
  }

  const columnas = Object.keys(limpios);
  if (!columnas.length) {
    return res.status(400).json({ ok: false, error: 'Sin campos para actualizar' });
  }

  // Los nombres de columna salen SOLO de las claves de la lista blanca
  // (columnaSql tira si alguna no está); los valores viajan siempre como parámetros.
  const sets = columnas.map(columna => `${columnaSql(columna)} = ?`).join(', ');
  const sql = `UPDATE GXCALDTA.CLIENTE SET ${sets} WHERE CLIID = ?`;
  const valores = [...columnas.map(columna => limpios[columna]), req.cliid];

  if (ensayo.valor) {
    console.log(`[Ficha] dryRun cliid=${req.cliid} columnas=[${columnas.join(', ')}]`);
    return res.json({ ok: true, dryRun: true, sql, valores });
  }

  console.log(`[Ficha] UPDATE cliid=${req.cliid} columnas=[${columnas.join(', ')}]`);

  let bruto;
  try {
    bruto = await updateFicha(sql, valores);
  } catch (err) {
    // Que quede el rastro del intento fallido de este lado también: goya-backend
    // audita su as400Ok:false, pero acá está el detalle del driver.
    console.error(
      `[Ficha] UPDATE FALLIDO cliid=${req.cliid} columnas=[${columnas.join(', ')}]: ${err.message}`
    );
    throw err;
  }

  const afectados = Number(bruto);
  if (!Number.isFinite(afectados)) {
    // Nunca responder ok:true sin saber si escribió: el caller espeja en Postgres con esa respuesta.
    console.error(`[Ficha] UPDATE cliid=${req.cliid}: el driver devolvió "${bruto}" en vez de un número de filas`);
    throw new Error('El AS400 devolvió una respuesta inesperada al actualizar: no se puede confirmar la escritura');
  }

  if (afectados === 0) {
    console.warn(`[Ficha] UPDATE cliid=${req.cliid} afectados=0 (cliente inexistente)`);
    return res.status(404).json({ ok: false, error: 'Cliente inexistente en el AS400' });
  }

  console.log(`[Ficha] UPDATE cliid=${req.cliid} afectados=${afectados}`);
  return res.json({ ok: true, afectados });
}));

module.exports = router;
