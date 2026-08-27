/**
 * Lista blanca de columnas escribibles de GXCALDTA.CLIENTE desde la ficha.
 *
 * Esta es la ÚNICA fuente de nombres de columna para el UPDATE: los nombres
 * jamás salen del body del request, solo de las claves de este objeto.
 *
 * Forma de cada definición:
 *   { tipo: 'char',   max: <largo máximo del texto> }
 *   { tipo: 'int',    max: <valor máximo; el mínimo es siempre 0> }
 *   { tipo: 'dec',    max: <precisión total>, escala: <decimales> }   // DECIMAL(max, escala)
 *   { tipo: 'fecha8' }                                                // CHAR(8) YYYYMMDD
 */
const CAMPOS_ESCRIBIBLES = {
  // Dirección
  CALPRINID: { tipo: 'int', max: 999999 },
  CALESQ1ID: { tipo: 'int', max: 999999 },
  CALESQ2ID: { tipo: 'int', max: 999999 },
  NROPUERTA: { tipo: 'int', max: 99999 },
  BIS: { tipo: 'char', max: 1 },
  APTO: { tipo: 'char', max: 5 },
  BLOCKSOL: { tipo: 'char', max: 4 },
  NIVEL: { tipo: 'char', max: 4 },
  LOCAL: { tipo: 'char', max: 4 },
  NROMANZ: { tipo: 'char', max: 5 },
  KM: { tipo: 'dec', max: 6, escala: 3 },
  DIROBS: { tipo: 'char', max: 60 },

  // Geolocalización — OJO: DIRCORX = LATITUD y DIRCORY = LONGITUD (nombres invertidos en el AS400).
  // DIRICAX / DIRICAY son UTM 21S (EPSG:32721): easting / northing.
  DIRCORX: { tipo: 'dec', max: 13, escala: 5 },
  DIRCORY: { tipo: 'dec', max: 13, escala: 5 },
  DIRICAX: { tipo: 'dec', max: 13, escala: 5 },
  DIRICAY: { tipo: 'dec', max: 13, escala: 5 },
  DIRFCHGEO: { tipo: 'fecha8' },

  // Cliente
  CLINOM: { tipo: 'char', max: 60 },
  CLIMAIL: { tipo: 'char', max: 60 },
  // CLIRUC es DECIMAL(12,0) en el AS400 (verificado en QSYS2.SYSCOLUMNS), no texto:
  // mandarle un string lo deja a merced de la coerción del driver.
  CLIRUC: { tipo: 'int', max: 999999999999 },
  CLIOBS: { tipo: 'char', max: 200 },
  CLIOBSCOM: { tipo: 'char', max: 80 },

  // Auditoría replicada a mano (GXCALDTA no tiene triggers)
  CLIOPUPD: { tipo: 'char', max: 15 },
  CLIFCH: { tipo: 'fecha8' },
};

// Campos de auditoría: no tiene sentido "limpiarlos", siempre viajan con valor.
const NO_ADMITEN_NULL = new Set(['CLIOPUPD', 'CLIFCH']);

// Palabras reservadas de DB2 for i que además son nombres de columna acá.
// Se emiten como identificador delimitado para que el parser no las confunda.
const RESERVADAS_DB2 = new Set(['LOCAL']);

/**
 * Devuelve el identificador SQL de una columna de la lista blanca.
 * Tira si la columna no está en la lista: es la última barrera antes de
 * concatenar un nombre en el SQL.
 *
 * @param {string} columna
 * @returns {string}
 */
function columnaSql(columna) {
  if (!Object.prototype.hasOwnProperty.call(CAMPOS_ESCRIBIBLES, columna)) {
    throw new Error(`Columna fuera de la lista blanca: ${columna}`);
  }
  return RESERVADAS_DB2.has(columna) ? `"${columna}"` : columna;
}

function esTextoONumero(valor) {
  return typeof valor === 'string' || typeof valor === 'number';
}

function validarChar(clave, def, valor) {
  if (!esTextoONumero(valor)) {
    return { error: `${clave}: se esperaba texto y llegó ${typeof valor}` };
  }
  const limpio = String(valor).trim();
  if (limpio.length > def.max) {
    return { error: `${clave}: tiene ${limpio.length} caracteres y el máximo es ${def.max}` };
  }
  return { valor: limpio };
}

function validarInt(clave, def, valor) {
  if (!esTextoONumero(valor)) {
    return { error: `${clave}: se esperaba un número entero y llegó ${typeof valor}` };
  }
  const texto = String(valor).trim();
  if (texto === '') {
    return { error: `${clave}: se esperaba un número entero y llegó vacío` };
  }
  const numero = Number(texto);
  if (!Number.isInteger(numero)) {
    return { error: `${clave}: "${texto}" no es un número entero` };
  }
  if (numero < 0 || numero > def.max) {
    return { error: `${clave}: ${numero} está fuera de rango (0…${def.max})` };
  }
  return { valor: numero };
}

function validarDec(clave, def, valor) {
  if (!esTextoONumero(valor)) {
    return { error: `${clave}: se esperaba un número y llegó ${typeof valor}` };
  }
  const texto = String(valor).trim();
  if (texto === '') {
    return { error: `${clave}: se esperaba un número y llegó vacío` };
  }
  const bruto = Number(texto);
  if (!Number.isFinite(bruto)) {
    return { error: `${clave}: "${texto}" no es un número finito` };
  }
  const escala = def.escala || 0;
  const digitosEnteros = def.max - escala;
  // Se redondea a la escala de la columna: es exactamente lo que haría el DECIMAL
  // del AS400 al guardarlo, y así el dryRun muestra el valor real que se va a escribir.
  const numero = Number(bruto.toFixed(escala));
  if (Math.abs(Math.trunc(numero)) >= 10 ** digitosEnteros) {
    return {
      error: `${clave}: ${bruto} excede los ${digitosEnteros} dígitos enteros de DECIMAL(${def.max},${escala})`,
    };
  }
  return { valor: numero };
}

function validarFecha8(clave, valor) {
  if (!esTextoONumero(valor)) {
    return { error: `${clave}: se esperaba una fecha YYYYMMDD y llegó ${typeof valor}` };
  }
  const texto = String(valor).trim();
  if (!/^\d{8}$/.test(texto)) {
    return { error: `${clave}: "${texto}" no tiene el formato YYYYMMDD (8 dígitos)` };
  }
  const anio = Number(texto.slice(0, 4));
  const mes = Number(texto.slice(4, 6));
  const dia = Number(texto.slice(6, 8));
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const valida =
    anio >= 1900 &&
    anio <= 2999 &&
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;
  if (!valida) {
    return { error: `${clave}: "${texto}" no es una fecha válida` };
  }
  return { valor: texto };
}

/**
 * Valida y normaliza los campos que llegan en el body del PATCH.
 *
 * - Rechaza toda clave que no esté en CAMPOS_ESCRIBIBLES (con el nombre en el error).
 * - char: String(v).trim(); si supera el largo → error (nunca trunca en silencio).
 * - int: entero dentro de 0…max.
 * - dec: número finito, dígitos enteros ≤ (precisión − escala).
 * - fecha8: exactamente 8 dígitos y fecha real.
 * - null limpia el campo, salvo en CLIOPUPD / CLIFCH.
 *
 * @param {Record<string, unknown>} campos
 * @returns {{ ok: boolean, limpios: Record<string, string|number|null>, errores: string[] }}
 */
function validar(campos) {
  const errores = [];
  const limpios = {};

  if (campos === null || typeof campos !== 'object' || Array.isArray(campos)) {
    return { ok: false, limpios, errores: ['campos tiene que ser un objeto { COLUMNA: valor }'] };
  }

  for (const clave of Object.keys(campos)) {
    if (!Object.prototype.hasOwnProperty.call(CAMPOS_ESCRIBIBLES, clave)) {
      errores.push(`Campo no permitido: ${clave}`);
      continue;
    }

    const def = CAMPOS_ESCRIBIBLES[clave];
    const valor = campos[clave];

    if (valor === undefined) {
      errores.push(`${clave}: llegó sin valor (undefined)`);
      continue;
    }

    if (valor === null) {
      if (NO_ADMITEN_NULL.has(clave)) {
        errores.push(`${clave}: no admite null (es un campo de auditoría, siempre va con valor)`);
      } else {
        limpios[clave] = null;
      }
      continue;
    }

    let resultado;
    switch (def.tipo) {
      case 'char':
        resultado = validarChar(clave, def, valor);
        break;
      case 'int':
        resultado = validarInt(clave, def, valor);
        break;
      case 'dec':
        resultado = validarDec(clave, def, valor);
        break;
      case 'fecha8':
        resultado = validarFecha8(clave, valor);
        break;
      default:
        resultado = { error: `${clave}: tipo desconocido en la lista blanca (${def.tipo})` };
    }

    if (resultado.error) errores.push(resultado.error);
    else limpios[clave] = resultado.valor;
  }

  return { ok: errores.length === 0, limpios, errores };
}

module.exports = { CAMPOS_ESCRIBIBLES, NO_ADMITEN_NULL, columnaSql, validar };
