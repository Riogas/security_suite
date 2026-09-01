/**
 * scripts/test-sync-admsec.ts
 *
 * Tests del planificador del sync horario ADMSEC → secapi
 * (src/lib/usuarios/syncAdmsec.ts).
 *
 * El repo no tiene runner de tests, así que esto es un script `tsx` con sus
 * propias aserciones — el mismo formato que scripts/test-usuarios-comparacion.ts.
 * Se corre con:
 *
 *   pnpm exec tsx scripts/test-sync-admsec.ts
 *
 * NO toca la base ni la red: `planificar` es pura y acá son todas fixtures.
 */

import {
  esCuentaDeSistemaSync,
  planificar,
  type AccionSync,
  type FilaLocalSync,
  type FilaOrigenSync,
} from "../src/lib/usuarios/syncAdmsec";

// ─── Mini framework de aserciones ───────────────────────────────────────────

let pasaron = 0;
const fallaron: string[] = [];

function test(nombre: string, fn: () => void): void {
  try {
    fn();
    pasaron++;
    console.log(`  ✓ ${nombre}`);
  } catch (error) {
    fallaron.push(nombre);
    console.log(`  ✗ ${nombre}`);
    console.log(`      ${(error as Error).message}`);
  }
}

function esperarIgual(actual: unknown, esperado: unknown, que: string): void {
  if (actual !== esperado) {
    throw new Error(`${que}: esperaba ${JSON.stringify(esperado)}, vino ${JSON.stringify(actual)}`);
  }
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

/** Formato real que devuelve VARCHAR_FORMAT(..., 'YYYY-MM-DD HH24:MI:SS.FF6'). */
const ANTES = "2026-09-01 10:00:00.000000";
const MARCA = "2026-09-01 11:00:00.000000";
const DESPUES = "2026-09-01 12:00:00.000000";

function origen(over: Partial<FilaOrigenSync> = {}): FilaOrigenSync {
  return { login: "JPEREZ", habilitado: true, autAd: "A", dtUpd: DESPUES, ...over };
}

function local(over: Partial<FilaLocalSync> = {}): FilaLocalSync {
  return { id: 1, username: "jperez", estado: "A", fechaBaja: null, esRoot: false, ...over };
}

const plan = (o: FilaOrigenSync[], l: FilaLocalSync[], marca: string | null) =>
  planificar(o, l, marca);

/** La única acción del plan, con un mensaje decente si no hay exactamente una. */
function unica(o: FilaOrigenSync[], l: FilaLocalSync[], marca: string | null): AccionSync {
  const { acciones } = plan(o, l, marca);
  if (acciones.length !== 1) {
    throw new Error(`esperaba 1 acción, vinieron ${acciones.length}: ${JSON.stringify(acciones)}`);
  }
  return acciones[0];
}

function sinAcciones(o: FilaOrigenSync[], l: FilaLocalSync[], marca: string | null): void {
  const { acciones } = plan(o, l, marca);
  esperarIgual(acciones.length, 0, `acciones (${JSON.stringify(acciones)})`);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

function main(): void {
  console.log("\nRegla A — altas de los que faltan en PG\n");

  test("un usuario que no está en PG → ALTA", () => {
    const a = unica([origen({ login: "NUEVO" })], [], MARCA);
    esperarIgual(a.tipo, "ALTA", "tipo");
    if (a.tipo !== "ALTA") return;
    esperarIgual(a.login, "NUEVO", "login");
    esperarIgual(a.habilitado, true, "habilitado");
    esperarIgual(a.origen, "LDAP", "origen");
  });

  test("un deshabilitado que falta también se da de alta, pero apagado", () => {
    // Decisión del dueño (spec 1): se importa toda la tabla, los
    // deshabilitados nacen con estado 'I'.
    const a = unica([origen({ login: "NUEVO", habilitado: false })], [], MARCA);
    esperarIgual(a.tipo, "ALTA", "tipo");
    if (a.tipo !== "ALTA") return;
    esperarIgual(a.habilitado, false, "habilitado");
  });

  test("USUAUTAD distinto de 'A' → origen GSIST", () => {
    const a = unica([origen({ login: "NUEVO", autAd: "G" })], [], MARCA);
    if (a.tipo !== "ALTA") throw new Error(`esperaba ALTA, vino ${a.tipo}`);
    esperarIgual(a.origen, "GSIST", "origen");
  });

  test("una cuenta de sistema que falta → OMITIDO CUENTA_SISTEMA, NO ALTA", () => {
    const a = unica([origen({ login: "DAEMONS" })], [], MARCA);
    esperarIgual(a.tipo, "OMITIDO", "tipo");
    if (a.tipo !== "OMITIDO") return;
    esperarIgual(a.motivo, "CUENTA_SISTEMA", "motivo");
  });

  test("el prefijo PEDWEB también es cuenta de sistema", () => {
    const a = unica([origen({ login: "PEDWEBTOMAPED" })], [], MARCA);
    if (a.tipo !== "OMITIDO") throw new Error(`esperaba OMITIDO, vino ${a.tipo}`);
    esperarIgual(a.motivo, "CUENTA_SISTEMA", "motivo");
  });

  test("la lista de cuentas de sistema del job es la propia, no la del wizard", () => {
    // GRANELWEBONLINE y TALLER no están en cuentasSistema.ts (el del wizard);
    // si alguien reemplaza esta lista por aquélla, esos dos se importan.
    esperarIgual(esCuentaDeSistemaSync("GRANELWEBONLINE"), true, "GRANELWEBONLINE");
    esperarIgual(esCuentaDeSistemaSync("TALLER"), true, "TALLER");
    esperarIgual(esCuentaDeSistemaSync("root"), true, "root en minúscula");
    esperarIgual(esCuentaDeSistemaSync("  ROOT "), true, "ROOT con espacios");
    esperarIgual(esCuentaDeSistemaSync("JPEREZ"), false, "una persona");
    esperarIgual(esCuentaDeSistemaSync(""), false, "vacío");
  });

  test("el match anda con AS400 en MAYÚSCULAS y PG en minúsculas", () => {
    // El caso real: AMOROSINI en ADMSEC, Amorosini en PG. Sin normalizar, esto
    // sería un ALTA y chocaría contra el @unique de username.
    sinAcciones([origen({ login: "AMOROSINI" })], [local({ username: "Amorosini" })], MARCA);
  });

  test("padrón sincronizado → cero acciones (spec 8.1)", () => {
    const r = plan(
      [origen({ login: "A1" }), origen({ login: "A2", habilitado: false })],
      [local({ id: 1, username: "a1", estado: "A" }), local({ id: 2, username: "a2", estado: "I" })],
      MARCA,
    );
    esperarIgual(r.acciones.length, 0, "acciones");
    esperarIgual(r.divergentesSinMarca, 0, "divergentesSinMarca");
  });

  console.log("\nRegla B — la comparación de la marca (spec 2.3 y 8.3)\n");

  test("dtUpd POSTERIOR a la marca y estado distinto → CAMBIO_ESTADO", () => {
    const a = unica([origen({ dtUpd: DESPUES, habilitado: false })], [local({ estado: "A" })], MARCA);
    esperarIgual(a.tipo, "CAMBIO_ESTADO", "tipo");
    if (a.tipo !== "CAMBIO_ESTADO") return;
    esperarIgual(a.usuarioId, 1, "usuarioId");
    esperarIgual(a.de, "A", "de");
    esperarIgual(a.a, "I", "a");
  });

  test("dtUpd ANTERIOR a la marca → no se toca, aunque el estado difiera", () => {
    sinAcciones([origen({ dtUpd: ANTES, habilitado: false })], [local({ estado: "A" })], MARCA);
  });

  test("dtUpd IGUAL a la marca → sí actúa (es >=, no >)", () => {
    // Con > se pierde la fila estampada en el microsegundo del arranque de la
    // corrida anterior.
    const a = unica([origen({ dtUpd: MARCA, habilitado: false })], [local({ estado: "A" })], MARCA);
    esperarIgual(a.tipo, "CAMBIO_ESTADO", "tipo");
  });

  test("la comparación es de TEXTO: un Date pierde los microsegundos y actúa de más", () => {
    // ESTE es el test que atrapa el bug de 2.3, y el motivo por el que la spec
    // existe. Los dos valores caen en el mismo milisegundo y solo se
    // distinguen en los microsegundos, que `new Date()` trunca:
    //   texto: "…000200" >= "…000500" → false → NO se toca (correcto)
    //   Date : 1788270315000 >= 1788270315000 → true → CAMBIO_ESTADO (mal)
    // Si alguien mete un new Date() en el medio, acá aparece una acción.
    const marca = "2026-09-01 10:45:15.000500";
    sinAcciones(
      [origen({ dtUpd: "2026-09-01 10:45:15.000200", habilitado: false })],
      [local({ estado: "A" })],
      marca,
    );
  });

  test("la comparación de texto no depende de que la marca parsee como fecha", () => {
    // La otra cara del mismo bug: si alguien convierte a Date y el parseo
    // falla, TODAS las comparaciones dan false y la Regla B no se dispara
    // nunca — con las corridas en verde. Este caso tiene que producir acción.
    const a = unica([origen({ dtUpd: DESPUES, habilitado: false })], [local({ estado: "A" })], MARCA);
    esperarIgual(a.tipo, "CAMBIO_ESTADO", "tipo");
  });

  test("marca === null (primera corrida) → ningún CAMBIO_ESTADO", () => {
    // Hoy las 1.106 filas comparten la marca del backfill: cualquier otro
    // criterio las metería a todas de golpe. Se siembra la marca y listo.
    sinAcciones([origen({ dtUpd: DESPUES, habilitado: false })], [local({ estado: "A" })], null);
  });

  test("marca === null igual da las altas de la Regla A", () => {
    const a = unica([origen({ login: "NUEVO" })], [], null);
    esperarIgual(a.tipo, "ALTA", "tipo");
  });

  test("dtUpd null → no se toca esa fila", () => {
    // La columna es nullable y la regla pide una marca más nueva; una fila sin
    // marca no la tiene.
    sinAcciones([origen({ dtUpd: null, habilitado: false })], [local({ estado: "A" })], MARCA);
  });

  test("marca avanzada pero el estado ya coincide → nada que escribir", () => {
    sinAcciones([origen({ dtUpd: DESPUES, habilitado: true })], [local({ estado: "A" })], MARCA);
  });

  test("el estado local se compara sin espacios ni mayúsculas", () => {
    sinAcciones([origen({ dtUpd: DESPUES, habilitado: true })], [local({ estado: " a " })], MARCA);
  });

  console.log("\nRegla B — los dos omitir que valen la pena (spec 3.4)\n");

  test("root que el origen manda DESACTIVAR → OMITIDO ES_ROOT", () => {
    // Si el job desactiva a los dos roots, nadie administra secapi y la
    // recuperación es SQL a mano contra producción.
    const a = unica(
      [origen({ login: "DMEDAGLIA", habilitado: false })],
      [local({ username: "dmedaglia", estado: "A", esRoot: true })],
      MARCA,
    );
    esperarIgual(a.tipo, "OMITIDO", "tipo");
    if (a.tipo !== "OMITIDO") return;
    esperarIgual(a.motivo, "ES_ROOT", "motivo");
    esperarIgual(a.login, "DMEDAGLIA", "login");
  });

  test("root que el origen manda ACTIVAR sí se activa (ES_ROOT solo frena la baja)", () => {
    const a = unica([origen({ habilitado: true })], [local({ estado: "I", esRoot: true })], MARCA);
    esperarIgual(a.tipo, "CAMBIO_ESTADO", "tipo");
    if (a.tipo !== "CAMBIO_ESTADO") return;
    esperarIgual(a.a, "A", "a");
  });

  test("con fechaBaja, el origen no lo puede REACTIVAR → OMITIDO BAJA_LOCAL", () => {
    // El soft-delete de secapi no borra los roles: reactivar devuelve a la
    // persona con todos los permisos que tenía.
    const a = unica(
      [origen({ habilitado: true })],
      [local({ estado: "I", fechaBaja: new Date("2026-06-15T00:00:00Z") })],
      MARCA,
    );
    esperarIgual(a.tipo, "OMITIDO", "tipo");
    if (a.tipo !== "OMITIDO") return;
    esperarIgual(a.motivo, "BAJA_LOCAL", "motivo");
  });

  test("sin fechaBaja y sin ser root, la reactivación SÍ se hace", () => {
    const a = unica([origen({ habilitado: true })], [local({ estado: "I" })], MARCA);
    esperarIgual(a.tipo, "CAMBIO_ESTADO", "tipo");
    if (a.tipo !== "CAMBIO_ESTADO") return;
    esperarIgual(a.de, "I", "de");
    esperarIgual(a.a, "A", "a");
  });

  test("con fechaBaja, una DESACTIVACIÓN no la frena BAJA_LOCAL", () => {
    const a = unica(
      [origen({ habilitado: false })],
      [local({ estado: "A", fechaBaja: new Date("2026-06-15T00:00:00Z") })],
      MARCA,
    );
    esperarIgual(a.tipo, "CAMBIO_ESTADO", "tipo");
  });

  test("una cuenta de sistema que YA existe en PG pasa por la Regla B", () => {
    // La lista de 3.5 solo aplica a las altas: si ROOT ya está migrado y allá
    // lo desactivan, acá se desactiva como cualquier otro.
    const a = unica(
      [origen({ login: "ROOT", habilitado: false })],
      [local({ id: 9, username: "root", estado: "A" })],
      MARCA,
    );
    esperarIgual(a.tipo, "CAMBIO_ESTADO", "tipo");
  });

  console.log("\nLa vigilancia de divergentes sin marca (spec 6)\n");

  test("estado divergente sin que la marca avance: se cuenta y NO se toca", () => {
    const r = plan(
      [origen({ login: "A1", dtUpd: ANTES, habilitado: false })],
      [local({ id: 1, username: "a1", estado: "A" })],
      MARCA,
    );
    esperarIgual(r.acciones.length, 0, "acciones");
    esperarIgual(r.divergentesSinMarca, 1, "divergentesSinMarca");
  });

  test("dtUpd null y estado divergente también cuenta", () => {
    const r = plan(
      [origen({ login: "A1", dtUpd: null, habilitado: false })],
      [local({ id: 1, username: "a1", estado: "A" })],
      MARCA,
    );
    esperarIgual(r.divergentesSinMarca, 1, "divergentesSinMarca");
  });

  test("en la primera corrida (marca null) todos los divergentes se cuentan", () => {
    const r = plan(
      [
        origen({ login: "A1", habilitado: false }),
        origen({ login: "A2", habilitado: true }),
        origen({ login: "A3", habilitado: true }),
      ],
      [
        local({ id: 1, username: "a1", estado: "A" }),
        local({ id: 2, username: "a2", estado: "I" }),
        local({ id: 3, username: "a3", estado: "A" }), // este coincide
      ],
      null,
    );
    esperarIgual(r.acciones.length, 0, "acciones");
    esperarIgual(r.divergentesSinMarca, 2, "divergentesSinMarca");
  });

  test("los que faltan en PG no cuentan como divergentes", () => {
    const r = plan([origen({ login: "NUEVO", habilitado: false })], [], MARCA);
    esperarIgual(r.acciones.length, 1, "acciones");
    esperarIgual(r.divergentesSinMarca, 0, "divergentesSinMarca");
  });

  test("el que SÍ se actualiza no se cuenta como divergente sin marca", () => {
    const r = plan(
      [origen({ dtUpd: DESPUES, habilitado: false })],
      [local({ estado: "A" })],
      MARCA,
    );
    esperarIgual(r.acciones.length, 1, "acciones");
    esperarIgual(r.divergentesSinMarca, 0, "divergentesSinMarca");
  });

  console.log("\nUn plan mezclado, como el de una corrida real\n");

  test("altas, cambio, omitidos y vigilancia conviven en el mismo plan", () => {
    const r = plan(
      [
        origen({ login: "NUEVO1" }),
        origen({ login: "NUEVO2", habilitado: false, autAd: "G" }),
        origen({ login: "DAEMONS" }),
        origen({ login: "CAMBIA", habilitado: false, dtUpd: DESPUES }),
        origen({ login: "ROOTY", habilitado: false, dtUpd: DESPUES }),
        origen({ login: "QUIETO", habilitado: false, dtUpd: ANTES }),
        origen({ login: "IGUAL" }),
      ],
      [
        local({ id: 10, username: "cambia", estado: "A" }),
        local({ id: 11, username: "rooty", estado: "A", esRoot: true }),
        local({ id: 12, username: "quieto", estado: "A" }),
        local({ id: 13, username: "igual", estado: "A" }),
      ],
      MARCA,
    );
    const conteo = (t: AccionSync["tipo"]) => r.acciones.filter((a) => a.tipo === t).length;
    esperarIgual(conteo("ALTA"), 2, "altas");
    esperarIgual(conteo("CAMBIO_ESTADO"), 1, "cambios");
    esperarIgual(conteo("OMITIDO"), 2, "omitidos");
    esperarIgual(r.divergentesSinMarca, 1, "divergentesSinMarca");
  });

  test("el origen vacío da un plan vacío", () => {
    const r = plan([], [local()], MARCA);
    esperarIgual(r.acciones.length, 0, "acciones");
    esperarIgual(r.divergentesSinMarca, 0, "divergentesSinMarca");
  });

  console.log(
    `\n${pasaron} ok, ${fallaron.length} fallidos${fallaron.length ? `: ${fallaron.join(", ")}` : ""}\n`,
  );
  if (fallaron.length > 0) process.exit(1);
}

main();
