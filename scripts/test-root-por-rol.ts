/**
 * scripts/test-root-por-rol.ts
 *
 * Test de "root es un ROL, no la columna `usuarios.es_root`". Se corre con:
 *
 *   pnpm test               (junto con el resto)
 *   pnpm test:root-por-rol
 *
 * El repo no tiene runner de tests: esto es un script `tsx` con sus propias
 * aserciones, mismo formato que `scripts/test-api-guard.ts`.
 *
 * NO toca la base ni la red. Lo que se ejercita es la función pura
 * `aplicacionesRootDe` de `src/lib/permisos.ts`, que es donde vive TODO el
 * criterio: nombre del rol, `roles.estado` y la vigencia de la asignación en
 * `usuario_roles` (`fecha_desde` / `fecha_hasta`). La consulta de Prisma solo
 * trae las filas; no filtra nada por su cuenta, justamente para que el criterio
 * sea uno solo y se pueda testear sin levantar Postgres.
 *
 * Además hay una sección ANTIENVEJECIMIENTO que recorre `src/`: si mañana
 * alguien vuelve a colgar una decisión de autorización de `esRoot`, el test
 * falla. Es la red de contención del cambio entero.
 */

import * as fs from "fs";
import * as path from "path";
import { nivelDeRuta } from "../src/lib/auth/apiGuard";
import {
  AutoQuitarseRootError,
  aplicacionIdDeSecapi,
  aplicacionesRootDe,
  asignacionVigente,
  esRolRoot,
  esRootDeAplicacion,
  SistemaSinRootError,
  usuariosRootDeSecapi,
  verificarQueQuedaRoot,
  type AsignacionDeRol,
  type UsuarioAuth,
} from "../src/lib/permisos";

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
    for (const linea of (error as Error).message.split("\n")) console.log(`      ${linea}`);
  }
}

/** Igual que `test`, para lo que hay que await-ear. */
async function testAsync(nombre: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    pasaron++;
    console.log(`  ✓ ${nombre}`);
  } catch (error) {
    fallaron.push(nombre);
    console.log(`  ✗ ${nombre}`);
    for (const linea of (error as Error).message.split("\n")) console.log(`      ${linea}`);
  }
}

function esperar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(mensaje);
}

function esperarIgual(actual: unknown, esperado: unknown, que: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(esperado);
  if (a !== e) throw new Error(`${que}: esperaba ${e}, vino ${a}`);
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

/**
 * Los ids de aplicación reales de producción (agosto 2026). Se ponen tal cual
 * para que el test hable el mismo idioma que la base y que el criterio de
 * aceptación, pero el código NO usa ids: identifica el rol por nombre +
 * aplicación, porque el id del rol Root es distinto en cada una (57, 55, 52, 60)
 * y en otra base van a ser otros.
 */
const APP_SECAPI = 1;
const APP_GOYA = 3;
const APP_TRACK = 5;
const APP_GRANEL = 6;

const AHORA = new Date("2026-08-28T14:00:00Z");
const AYER = new Date("2026-08-27T00:00:00Z");
const MANANA = new Date("2026-08-29T00:00:00Z");
const HACE_UN_ANO = new Date("2025-08-28T00:00:00Z");

/** Una fila de `usuario_roles` + su `roles` + su `aplicaciones`, con defaults cómodos. */
function asignacion(
  opciones: Partial<{
    nombre: string;
    estado: string;
    aplicacionId: number;
    /** `aplicaciones.estado` de la aplicación dueña del rol. */
    aplicacionEstado: string;
    fechaDesde: Date | null;
    fechaHasta: Date | null;
  }> = {},
): AsignacionDeRol {
  return {
    fechaDesde: opciones.fechaDesde ?? null,
    fechaHasta: opciones.fechaHasta ?? null,
    rol: {
      nombre: opciones.nombre ?? "Root",
      estado: opciones.estado ?? "A",
      aplicacionId: opciones.aplicacionId ?? APP_SECAPI,
      aplicacion: { estado: opciones.aplicacionEstado ?? "A" },
    },
  };
}

function usuario(aplicacionesRoot: number[]): UsuarioAuth {
  return {
    id: 1,
    username: "test",
    aplicacionesRoot,
    esRootDeSecapi: aplicacionesRoot.includes(APP_SECAPI),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\nRoot por ROL (src/lib/permisos.ts)\n");

  // ── El nombre del rol ─────────────────────────────────────────────────────

  test("el rol se identifica por nombre, con trim y sin distinguir mayúsculas", () => {
    for (const nombre of ["Root", "root", "ROOT", "  Root  ", "\tRoOt\n"]) {
      esperar(esRolRoot(nombre), `"${nombre}" tendría que contar como el rol Root`);
    }
  });

  test("no confunde al rol Root con otro que se le parezca", () => {
    for (const nombre of ["Rootless", "Root Goya", "Superroot", "Administrador", "", null, undefined]) {
      esperar(!esRolRoot(nombre), `"${nombre}" NO tendría que contar como el rol Root`);
    }
  });

  // ── Los casos del cambio ──────────────────────────────────────────────────

  test("rol Root vigente y activo: es root de esa aplicación", () => {
    esperarIgual(aplicacionesRootDe([asignacion()], AHORA), [APP_SECAPI], "aplicaciones root");
  });

  test("asignación sin fechas (las dos null): vigente para siempre", () => {
    // Es el caso de la enorme mayoría de las filas de `usuario_roles`.
    esperarIgual(
      aplicacionesRootDe([asignacion({ fechaDesde: null, fechaHasta: null })], AHORA),
      [APP_SECAPI],
      "aplicaciones root",
    );
  });

  test("asignación VENCIDA (fecha_hasta pasada): NO es root", () => {
    esperarIgual(
      aplicacionesRootDe([asignacion({ fechaHasta: AYER })], AHORA),
      [],
      "una asignación vencida no puede seguir dando root",
    );
  });

  test("asignación que todavía no empezó (fecha_desde futura): NO es root", () => {
    esperarIgual(
      aplicacionesRootDe([asignacion({ fechaDesde: MANANA })], AHORA),
      [],
      "una asignación futura no da root todavía",
    );
  });

  test("asignación dentro de la ventana desde/hasta: sí es root", () => {
    esperarIgual(
      aplicacionesRootDe([asignacion({ fechaDesde: HACE_UN_ANO, fechaHasta: MANANA })], AHORA),
      [APP_SECAPI],
      "aplicaciones root",
    );
  });

  test("rol INACTIVO (roles.estado != 'A'): NO es root", () => {
    esperarIgual(
      aplicacionesRootDe([asignacion({ estado: "I" })], AHORA),
      [],
      "un rol dado de baja no puede dar root",
    );
  });

  test("APLICACIÓN inactiva (aplicaciones.estado != 'A'): NO es root", () => {
    // El rol Root de una aplicación dada de baja no puede seguir abriendo su
    // menú ni su motor de permisos. Ojo con el contrapeso: si la aplicación que
    // se da de baja es SecuritySuite, esto apaga a TODOS los root de una — por
    // eso el ABM de aplicaciones subió a nivel ROOT y sus handlers verifican
    // que quede root (`verificarQueQuedaRoot`).
    esperarIgual(
      aplicacionesRootDe([asignacion({ aplicacionEstado: "I" })], AHORA),
      [],
      "una aplicación dada de baja no puede dar root",
    );
  });

  test("rol Root de OTRA aplicación: root de esa, no de SecuritySuite", () => {
    const apps = aplicacionesRootDe([asignacion({ aplicacionId: APP_GOYA })], AHORA);
    esperarIgual(apps, [APP_GOYA], "aplicaciones root");
    esperar(!apps.includes(APP_SECAPI), "no puede ser root de secapi por tener el Root de GOYA");
  });

  test("usuario con es_root='S' en la columna pero SIN el rol: NO es root", () => {
    /*
     * Este es EL caso del cambio. `UsuarioAuth` ya ni trae la columna, así que
     * el test es directo: sin asignación del rol Root no hay root, aunque en la
     * base `es_root` diga 'S'. Lo que garantiza que la columna no pueda volver
     * a colarse es la sección antienvejecimiento de más abajo.
     */
    const soloRolesComunes = [
      asignacion({ nombre: "Operador" }),
      asignacion({ nombre: "Consulta", aplicacionId: APP_TRACK }),
    ];
    esperarIgual(aplicacionesRootDe(soloRolesComunes, AHORA), [], "aplicaciones root");
  });

  test("varias aplicaciones a la vez, sin duplicados y ordenadas", () => {
    const apps = aplicacionesRootDe(
      [
        asignacion({ aplicacionId: APP_GRANEL }),
        asignacion({ aplicacionId: APP_SECAPI }),
        asignacion({ aplicacionId: APP_TRACK }),
        asignacion({ aplicacionId: APP_SECAPI }), // repetida
        asignacion({ nombre: "Operador", aplicacionId: APP_GOYA }),
      ],
      AHORA,
    );
    esperarIgual(apps, [APP_SECAPI, APP_TRACK, APP_GRANEL], "aplicaciones root");
  });

  test("sin ninguna asignación: no es root de nada", () => {
    esperarIgual(aplicacionesRootDe([], AHORA), [], "aplicaciones root");
  });

  // ── Vigencia, aislada ─────────────────────────────────────────────────────

  test("asignacionVigente cubre los cuatro bordes", () => {
    esperar(asignacionVigente({ fechaDesde: null, fechaHasta: null }, AHORA), "sin fechas: vigente");
    esperar(asignacionVigente({ fechaDesde: AYER, fechaHasta: null }, AHORA), "empezó ayer: vigente");
    esperar(!asignacionVigente({ fechaDesde: MANANA, fechaHasta: null }, AHORA), "empieza mañana: no");
    esperar(!asignacionVigente({ fechaDesde: null, fechaHasta: AYER }, AHORA), "venció ayer: no");
  });

  // ── Las dos granularidades ────────────────────────────────────────────────

  test("root de SECAPI da true para CUALQUIER aplicación", () => {
    /*
     * El alcance que definió el dueño: "que sea ese el rol válido para decir
     * que somos root y tenemos acceso a todo básicamente". El rol Root de
     * SecuritySuite es el superusuario del ecosistema, igual que lo era
     * `es_root='S'`. Si este test se cae porque alguien "arregló"
     * `esRootDeAplicacion` para que mire solo la aplicación pedida, leé el
     * comentario de esa función antes de cambiar el test: no es un descuido.
     */
    const u = usuario([APP_SECAPI]);
    esperar(u.esRootDeSecapi, "es root de secapi");
    for (const app of [APP_SECAPI, APP_GOYA, APP_TRACK, APP_GRANEL, 99]) {
      esperar(esRootDeAplicacion(u, app), `el root de secapi tiene que ser root de la app ${app}`);
    }
  });

  test("root de la aplicación X da true para X y false para las demás", () => {
    // La granularidad por aplicación NO se perdió: solo secapi es transversal.
    const u = usuario([APP_GOYA]);
    esperar(!u.esRootDeSecapi, "el Root de GOYA no es root de secapi");
    esperar(esRootDeAplicacion(u, APP_GOYA), "root de GOYA");
    for (const app of [APP_SECAPI, APP_TRACK, APP_GRANEL]) {
      esperar(!esRootDeAplicacion(u, app), `el Root de GOYA NO puede ser root de la app ${app}`);
    }
  });

  test("root de dos aplicaciones, ninguna secapi: esas dos y nada más", () => {
    const u = usuario([APP_TRACK, APP_GRANEL]);
    esperar(esRootDeAplicacion(u, APP_TRACK), "root de track");
    esperar(esRootDeAplicacion(u, APP_GRANEL), "root de granel");
    esperar(!esRootDeAplicacion(u, APP_GOYA), "no es root de GOYA");
    esperar(!esRootDeAplicacion(u, APP_SECAPI), "no es root de secapi");
  });

  test("esRootDeAplicacion es fail-closed sin usuario o sin aplicación", () => {
    const u = usuario([APP_SECAPI, APP_GOYA, APP_TRACK, APP_GRANEL]);
    esperar(!esRootDeAplicacion(null, APP_SECAPI), "sin usuario: no");
    esperar(!esRootDeAplicacion(undefined, APP_SECAPI), "sin usuario: no");
    esperar(!esRootDeAplicacion(u, null), "sin aplicación: no");
    // El menú calcula `aplicacionId` con un `Number(...)` que puede dar 0. Ni
    // siquiera el root de secapi pasa: "no sé de qué aplicación me hablás" no
    // puede ser un permiso.
    esperar(!esRootDeAplicacion(u, 0), "aplicacionId 0: no, ni para el root de secapi");
    esperar(!esRootDeAplicacion(usuario([APP_SECAPI]), 0), "aplicacionId 0 con root de secapi: no");
  });

  test("sin ningún rol Root, no es root de ninguna aplicación", () => {
    const u = usuario([]);
    for (const app of [APP_SECAPI, APP_GOYA, APP_TRACK, APP_GRANEL]) {
      esperar(!esRootDeAplicacion(u, app), `sin roles Root no puede ser root de ${app}`);
    }
  });

  // ── La aplicación SecuritySuite sale de env ───────────────────────────────

  test("aplicacionIdDeSecapi: default 1, y sale de la env que ya usa el repo", () => {
    const previoPublic = process.env.NEXT_PUBLIC_APLICACION_ID;
    const previoPlano = process.env.APLICACION_ID;
    try {
      delete process.env.NEXT_PUBLIC_APLICACION_ID;
      delete process.env.APLICACION_ID;
      esperarIgual(aplicacionIdDeSecapi(), 1, "default");

      process.env.APLICACION_ID = "9";
      esperarIgual(aplicacionIdDeSecapi(), 9, "APLICACION_ID");

      process.env.NEXT_PUBLIC_APLICACION_ID = "7";
      esperarIgual(aplicacionIdDeSecapi(), 7, "NEXT_PUBLIC_APLICACION_ID gana");

      process.env.NEXT_PUBLIC_APLICACION_ID = "no-es-un-numero";
      esperarIgual(aplicacionIdDeSecapi(), 1, "basura en la env cae al default");
    } finally {
      if (previoPublic === undefined) delete process.env.NEXT_PUBLIC_APLICACION_ID;
      else process.env.NEXT_PUBLIC_APLICACION_ID = previoPublic;
      if (previoPlano === undefined) delete process.env.APLICACION_ID;
      else process.env.APLICACION_ID = previoPlano;
    }
  });

  // ── Los dos usuarios reales del criterio de aceptación ────────────────────

  test("producción: dmedaglia y jgomez dan root de secapi (los dos tienen el rol 57)", () => {
    /*
     * El caso concreto que motivó el cambio. En la base de producción:
     *   - dmedaglia (845): es_root='S' y los CUATRO roles Root (57, 55, 52, 60).
     *   - jgomez    (838): es_root='N' pero los roles Root 57, 55 y 52.
     * Con la columna, jgomez no era root. Con el rol, los dos lo son para
     * SecuritySuite — que es el criterio de aceptación del pedido.
     */
    const dmedaglia = aplicacionesRootDe(
      [
        asignacion({ aplicacionId: APP_SECAPI }), // rol 57
        asignacion({ aplicacionId: APP_GOYA }), // rol 55
        asignacion({ aplicacionId: APP_TRACK }), // rol 52
        asignacion({ aplicacionId: APP_GRANEL }), // rol 60
      ],
      AHORA,
    );
    const jgomez = aplicacionesRootDe(
      [
        asignacion({ aplicacionId: APP_SECAPI }), // rol 57
        asignacion({ aplicacionId: APP_GOYA }), // rol 55
        asignacion({ aplicacionId: APP_TRACK }), // rol 52
      ],
      AHORA,
    );

    esperar(dmedaglia.includes(APP_SECAPI), "dmedaglia tiene que dar root de secapi");
    esperar(jgomez.includes(APP_SECAPI), "jgomez tiene que dar root de secapi");
    esperar(!jgomez.includes(APP_GRANEL), "jgomez NO tiene el Root de Granel");
    esperarIgual(dmedaglia, [APP_SECAPI, APP_GOYA, APP_TRACK, APP_GRANEL], "apps de dmedaglia");

    // Y con el alcance nuevo, los dos son root de las CUATRO aplicaciones por
    // tener el 57, aunque jgomez no tenga el 60 de Granel.
    const uJgomez = usuario(jgomez);
    for (const app of [APP_SECAPI, APP_GOYA, APP_TRACK, APP_GRANEL]) {
      esperar(esRootDeAplicacion(uJgomez, app), `jgomez tiene que ser root de la app ${app}`);
    }
  });

  // ── No dejar el sistema sin root ──────────────────────────────────────────
  //
  // `verificarQueQuedaRoot` es la red que corre DENTRO de la transacción de los
  // cinco endpoints que pueden apagar el root (asignar roles, ABM de roles,
  // baja de usuario, ABM de aplicaciones). Se ejercita con un cliente de Prisma
  // de mentira: lo único que necesita son dos `findMany`, así que no hace falta
  // ni base ni mocks de la librería.

  console.log("\nNo dejar el sistema sin root (verificarQueQuedaRoot)\n");

  /**
   * Cliente falso con la forma que consume `usuariosRootDeSecapi`:
   * `rol.findMany` (los roles de la aplicación) y `usuarioRol.findMany`
   * (las asignaciones vigentes). El `distinct` y los filtros de fecha los
   * resuelve Postgres en la vida real, así que acá se le pasa directamente la
   * lista de usuarios que quedarían.
   */
  function clienteFalso(opciones: {
    rolesDeSecapi: { id: number; nombre: string }[];
    usuariosConEseRol: number[];
  }) {
    return {
      rol: {
        findMany: async () => opciones.rolesDeSecapi,
      },
      usuarioRol: {
        findMany: async () => opciones.usuariosConEseRol.map((usuarioId) => ({ usuarioId })),
      },
    } as never;
  }

  const DMEDAGLIA = 845;
  const JGOMEZ = 838;

  await testAsync("usuariosRootDeSecapi devuelve los que tienen el rol llamado Root", async () => {
    const cliente = clienteFalso({
      // Solo el que se llama "Root" cuenta, con trim y sin mirar mayúsculas.
      rolesDeSecapi: [
        { id: 57, nombre: "  root  " },
        { id: 12, nombre: "Operador" },
      ],
      usuariosConEseRol: [DMEDAGLIA, JGOMEZ],
    });
    esperarIgual(await usuariosRootDeSecapi(cliente), [DMEDAGLIA, JGOMEZ], "roots");
  });

  await testAsync("si la aplicación no tiene rol Root, no hay ningún root", async () => {
    const cliente = clienteFalso({
      // Alguien renombró el 57. El código no adivina por id.
      rolesDeSecapi: [{ id: 57, nombre: "Administrador" }],
      usuariosConEseRol: [DMEDAGLIA, JGOMEZ],
    });
    esperarIgual(await usuariosRootDeSecapi(cliente), [], "roots");
  });

  await testAsync("quitarle el rol al ÚLTIMO root se rechaza", async () => {
    // El caso del informe: un admin abre "Asignar roles" de dmedaglia, que es
    // el único root que queda, y guarda con la casilla destildada.
    const cliente = clienteFalso({
      rolesDeSecapi: [{ id: 57, nombre: "Root" }],
      usuariosConEseRol: [], // así quedaría la tabla después del deleteMany
    });
    let tiro: unknown = null;
    try {
      await verificarQueQuedaRoot(cliente, usuario([APP_SECAPI]), false);
    } catch (error) {
      tiro = error;
    }
    esperar(
      tiro instanceof SistemaSinRootError,
      `esperaba SistemaSinRootError, vino ${tiro === null ? "nada" : String(tiro)}`,
    );
  });

  await testAsync("no se puede dejar sin root ni confirmando", async () => {
    // `confirmarQuitarmeRoot` habilita quitarse el propio rol, NO vaciar el
    // sistema. Esto último no se puede ni queriendo.
    const cliente = clienteFalso({
      rolesDeSecapi: [{ id: 57, nombre: "Root" }],
      usuariosConEseRol: [],
    });
    let tiro: unknown = null;
    try {
      await verificarQueQuedaRoot(cliente, usuario([APP_SECAPI]), true);
    } catch (error) {
      tiro = error;
    }
    esperar(tiro instanceof SistemaSinRootError, "la confirmación no puede saltear esta regla");
  });

  await testAsync("quedando OTRO root, la operación pasa", async () => {
    // jgomez le quita el rol a dmedaglia y queda él: es una operación legítima.
    const cliente = clienteFalso({
      rolesDeSecapi: [{ id: 57, nombre: "Root" }],
      usuariosConEseRol: [JGOMEZ],
    });
    const quienLlama: UsuarioAuth = { ...usuario([APP_SECAPI]), id: JGOMEZ };
    await verificarQueQuedaRoot(cliente, quienLlama, false);
  });

  await testAsync("quitarse el root a UNO MISMO se rechaza si no se confirma", async () => {
    // jgomez se saca su propio Root y dmedaglia sigue siendo root: el sistema
    // no queda vacío, pero jgomez sí queda afuera del panel sin poder volver.
    const cliente = clienteFalso({
      rolesDeSecapi: [{ id: 57, nombre: "Root" }],
      usuariosConEseRol: [DMEDAGLIA],
    });
    const quienLlama: UsuarioAuth = { ...usuario([APP_SECAPI]), id: JGOMEZ };
    let tiro: unknown = null;
    try {
      await verificarQueQuedaRoot(cliente, quienLlama, false);
    } catch (error) {
      tiro = error;
    }
    esperar(
      tiro instanceof AutoQuitarseRootError,
      `esperaba AutoQuitarseRootError, vino ${tiro === null ? "nada" : String(tiro)}`,
    );
  });

  await testAsync("quitarse el root a UNO MISMO pasa si se confirma", async () => {
    const cliente = clienteFalso({
      rolesDeSecapi: [{ id: 57, nombre: "Root" }],
      usuariosConEseRol: [DMEDAGLIA],
    });
    const quienLlama: UsuarioAuth = { ...usuario([APP_SECAPI]), id: JGOMEZ };
    await verificarQueQuedaRoot(cliente, quienLlama, true);
  });

  await testAsync("al que NO era root, la regla del auto-quitarse no lo toca", async () => {
    // Un usuario común no puede llegar acá (los endpoints son de nivel ROOT),
    // pero si llegara, no tiene root propio que perder: no hay nada que
    // confirmar y la única regla que aplica es que quede alguien.
    const cliente = clienteFalso({
      rolesDeSecapi: [{ id: 57, nombre: "Root" }],
      usuariosConEseRol: [DMEDAGLIA],
    });
    const quienLlama: UsuarioAuth = { ...usuario([]), id: 500 };
    await verificarQueQuedaRoot(cliente, quienLlama, false);
  });

  // ── Antienvejecimiento ────────────────────────────────────────────────────

  console.log("\nAntienvejecimiento: `es_root` no puede volver a autorizar\n");

  test("ni src/ ni scripts/ deciden autorización leyendo `esRoot`", () => {
    /*
     * El punto del cambio no es que hoy funcione: es que no vuelva. Estos son
     * los usos que significan "decidir con la columna". Leerla y devolverla
     * como DATO (la ficha del usuario, el `select` de por-username) sigue
     * estando permitido: la columna se queda en el schema.
     *
     * Este test cubría MENOS de lo que decía, y lo marcó la revisión: recorría
     * solo `src/` y no atrapaba el `where: { esRoot: "S" }` — que es
     * literalmente el patrón que este mismo cambio tuvo que arreglar en tres
     * scripts (import-sgm-preferences y los dos seeds), o sea justo el lugar y
     * justo la forma que se le escapaban. Ahora recorre las DOS carpetas y
     * suma los patrones que faltaban: el `where`, el `if (u.esRoot)` a secas y
     * el ternario.
     */
    const sospechosos: Array<{ re: RegExp; que: string }> = [
      { re: /\besRoot\s*[=!]==\s*["']S["']/, que: 'comparación esRoot === "S"' },
      { re: /["']S["']\s*[=!]==\s*[\w.?]*esRoot\b/, que: 'comparación "S" === esRoot' },
      { re: /\besRoot\?\.\s*trim\(\)/, que: "esRoot?.trim() (el viejo chequeo de ADMSEC)" },
      { re: /\bdata:\s*\{\s*esRoot:/, que: "escritura de esRoot en un update de Prisma" },
      { re: /\bwhere:\s*\{[^}]*\besRoot\s*:/, que: "filtro `where: { esRoot: ... }` de Prisma" },
      { re: /\besRoot\s*:\s*["']S["']/, que: 'literal `esRoot: "S"` (filtro o escritura)' },
      { re: /\bif\s*\(\s*!?[\w.]*\besRoot\b\s*\)/, que: "`if (algo.esRoot)`: la columna como booleano" },
      { re: /[\w.]*\besRoot\b\s*\?\s*[^:]+:/, que: "ternario decidiendo con esRoot" },
      // Se probó y se descartó un patrón más ancho ("esRoot en cualquier
      // condición", `&& esRoot` / `esRoot &&`): daba falso positivo justo en
      // `usuarios/[id]/route.ts`, en el `if` que RECHAZA que se escriba la
      // columna. Un test antienvejecimiento que grita por el código que
      // implementa la regla no sirve: el que lo vea rojo lo va a apagar.
    ];

    const hallazgos: string[] = [];
    const recorrer = (dir: string): void => {
      for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        const completo = path.join(dir, entrada.name);
        if (entrada.isDirectory()) {
          recorrer(completo);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entrada.name)) continue;
        const relativo = path.relative(process.cwd(), completo).replace(/\\/g, "/");
        // Este mismo archivo tiene los patrones escritos como texto: si se
        // recorriera a sí mismo, fallaría siempre.
        if (relativo.endsWith("scripts/test-root-por-rol.ts")) continue;
        const lineas = fs.readFileSync(completo, "utf8").split(/\r?\n/);
        lineas.forEach((linea, i) => {
          // Los comentarios explican justamente lo que se sacó: no cuentan.
          const codigo = linea.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
          for (const s of sospechosos) {
            if (s.re.test(codigo)) hallazgos.push(`${relativo}:${i + 1} — ${s.que}: ${linea.trim()}`);
          }
        });
      }
    };
    recorrer(path.join(process.cwd(), "src"));
    recorrer(path.join(process.cwd(), "scripts"));

    esperar(
      hallazgos.length === 0,
      "la columna `usuarios.es_root` volvió a usarse para autorizar. Root se resuelve\n" +
        "por el rol (ver src/lib/permisos.ts). Encontrado en:\n" +
        hallazgos.map((h) => `  - ${h}`).join("\n"),
    );
  });

  test("los endpoints que otorgan permisos siguen en nivel ROOT", () => {
    /*
     * La otra mitad del antienvejecimiento, y la que impide que vuelva la
     * escalada: root vive en `usuario_roles`, así que si alguna de estas rutas
     * baja a AUTENTICADA, cualquiera de los 854 usuarios se hace root con un
     * request. Se lee la tabla de POLITICAS a través de `nivelDeRuta`, que es
     * la misma función que usa el guard — no una copia de la lista.
     */
    const deberianSerRoot: Array<[string, string]> = [
      ["PUT", "/api/db/usuarios/845/roles"],
      ["PUT", "/api/db/usuarios/845/accesos"],
      ["DELETE", "/api/db/usuarios/845"],
      ["POST", "/api/db/accesos"],
      ["DELETE", "/api/db/accesos"],
      ["POST", "/api/db/roles"],
      ["PUT", "/api/db/roles/57"],
      ["DELETE", "/api/db/roles/57"],
      ["POST", "/api/db/roles/57/clonar"],
      ["POST", "/api/db/funcionalidades"],
      ["PUT", "/api/db/funcionalidades/9"],
      ["DELETE", "/api/db/funcionalidades/9"],
      ["PUT", "/api/db/funcionalidades/9/acciones"],
      ["POST", "/api/db/objetos"],
      ["PUT", "/api/db/objetos/9"],
      ["DELETE", "/api/db/objetos/9"],
      ["POST", "/api/db/aplicaciones"],
      ["PUT", "/api/db/aplicaciones/1"],
      ["DELETE", "/api/db/aplicaciones/1"],
      ["PUT", "/api/db/menu/builder"],
    ];
    const flojas = deberianSerRoot.filter(([m, r]) => nivelDeRuta(r, m) !== "ROOT");
    esperar(
      flojas.length === 0,
      "estas rutas pueden alterar quién tiene qué y dejaron de exigir ROOT:\n" +
        flojas.map(([m, r]) => `  - ${m} ${r} → ${nivelDeRuta(r, m)}`).join("\n"),
    );
  });

  test("`UsuarioAuth` no expone la columna: autorizar con ella no compila", () => {
    const fuente = fs.readFileSync(path.join(process.cwd(), "src/lib/permisos.ts"), "utf8");
    const bloque = /export interface UsuarioAuth \{([\s\S]*?)\n\}/.exec(fuente);
    esperar(bloque !== null, "no se encontró la interfaz UsuarioAuth");
    esperar(
      !/^\s*esRoot\s*[?:]/m.test(bloque![1]),
      "UsuarioAuth volvió a traer `esRoot`: sacalo, o el próximo guard se va a colgar de la columna",
    );
    esperar(
      /esRootDeSecapi/.test(bloque![1]) && /aplicacionesRoot/.test(bloque![1]),
      "UsuarioAuth tiene que exponer las dos granularidades de root",
    );
  });

  // ── Resumen ───────────────────────────────────────────────────────────────

  console.log(`\n${pasaron} pasaron, ${fallaron.length} fallaron\n`);
  if (fallaron.length > 0) {
    for (const n of fallaron) console.log(`  ✗ ${n}`);
    process.exit(1);
  }
}

void main();
