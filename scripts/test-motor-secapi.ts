/**
 * scripts/test-motor-secapi.ts
 *
 * Dos cosas que viven en src/lib/permisos.ts y que el guard da por hechas:
 *
 *   1. EL MOTOR aplicado a secapi (`usuarioTieneFuncionalidad`): la
 *      generalización de `usuarioPuedeAprobar`. Resuelve objeto → acción →
 *      funcionalidades activas y vigentes → ¿el usuario tiene alguna, por rol o
 *      por acceso directo? Es lo que decide el nivel ADMIN.
 *   2. LA IDENTIDAD (`elegirIdentidad`, `colisionesDeIdentidad`): que el sujeto
 *      del token resuelva a UNA persona y no a la que Postgres devuelva primero.
 *      Sin esto, todo lo demás es decorativo — da igual cuán fino sea el permiso
 *      si el token puede resolver a la fila de otro.
 *
 * Se corre con:
 *
 *   pnpm test                  (junto con el resto)
 *   pnpm test:motor-secapi
 *
 * NO toca la base. El motor se construye con `crearMotorPrisma()` sobre una
 * base EN MEMORIA (`baseFalsa`, más abajo) que implementa a mano las seis
 * consultas que el motor hace. Lo que eso prueba y lo que no:
 *
 *   - SÍ prueba la lógica: qué se otorga por rol, qué por acceso directo, y que
 *     una funcionalidad inactiva / vencida / `solo_root` no otorgue nada.
 *   - NO prueba que el SQL que Prisma genera sea el correcto. Para eso hace
 *     falta Postgres, y este repo no tiene base de tests.
 *
 * El resto (`elegirIdentidad`, `colisionesDeIdentidad`) son funciones puras y se
 * ejercitan directo.
 */

import {
  colisionesDeIdentidad,
  crearMotorPrisma,
  elegirIdentidad,
  objetosAdministrablesDe,
  usuarioPuedeAprobar,
  usuarioTieneFuncionalidad,
  type ClientePrismaMotor,
  type FilaIdentidad,
  type UsuarioAuth,
} from "../src/lib/permisos";

// La aplicación SecuritySuite. El motor filtra por esta, así que el fixture
// tiene que usar la misma o no encuentra nada.
process.env.NEXT_PUBLIC_APLICACION_ID = "1";
const APP = 1;

// ─── Mini framework de aserciones ───────────────────────────────────────────
// Mismo formato que scripts/test-api-guard.ts: el repo no tiene runner.

let pasaron = 0;
const fallaron: string[] = [];

async function test(nombre: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    pasaron++;
    console.log(`  ✓ ${nombre}`);
  } catch (error) {
    fallaron.push(nombre);
    console.log(`  ✗ ${nombre}`);
    console.log(`      ${(error as Error).message}`);
  }
}

function esperar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(mensaje);
}

function esperarIgual(actual: unknown, esperado: unknown, que: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(esperado)) {
    throw new Error(`${que}: esperaba ${JSON.stringify(esperado)}, vino ${JSON.stringify(actual)}`);
  }
}

// ─── Base en memoria ────────────────────────────────────────────────────────

interface Fixture {
  objetos: Array<{ id: number; aplicacionId: number; key: string; estado: string }>;
  objetoAcciones: Array<{ id: number; objetoId: number; key: string }>;
  funcionalidades: Array<{
    id: number;
    aplicacionId: number;
    estado: string;
    soloRoot: string;
    fechaDesde: Date | null;
    fechaHasta: Date | null;
  }>;
  vinculos: Array<{ funcionalidadId: number; objetoId: number; objetoAccionId: number | null }>;
  accesos: Array<{
    usuarioId: number;
    funcionalidadId: number;
    efecto: string;
    fechaDesde: Date | null;
    fechaHasta: Date | null;
  }>;
  usuarioRoles: Array<{
    usuarioId: number;
    rolId: number;
    rolEstado: string;
    fechaDesde: Date | null;
    fechaHasta: Date | null;
  }>;
  rolFuncionalidades: Array<{ rolId: number; funcionalidadId: number }>;
}

const AYER = new Date(Date.now() - 24 * 60 * 60 * 1000);
const MANANA = new Date(Date.now() + 24 * 60 * 60 * 1000);

/**
 * Implementa a mano las seis consultas del motor. Es un intérprete mínimo: lee
 * exactamente los campos que `crearMotorPrisma` pone en cada `where` y nada
 * más. Si mañana el motor consulta otra cosa, esto explota con un error claro
 * en vez de mentir un `true`.
 */
function baseFalsa(f: Fixture): ClientePrismaMotor {
  const vigente = (
    desde: Date | null,
    hasta: Date | null,
    ahora: Date,
  ): boolean =>
    (desde === null || desde.getTime() <= ahora.getTime()) &&
    (hasta === null || hasta.getTime() >= ahora.getTime());

  const cliente = {
    objeto: {
      async findFirst({ where }: any) {
        const hit = f.objetos
          .filter(
            (o) =>
              o.aplicacionId === where.aplicacionId &&
              o.key === where.key &&
              o.estado === where.estado,
          )
          .sort((a, b) => a.id - b.id)[0];
        return hit ? { id: hit.id } : null;
      },
    },
    objetoAccion: {
      async findFirst({ where }: any) {
        const buscada = String(where.key.equals).toLowerCase();
        const hit = f.objetoAcciones
          .filter((a) => a.objetoId === where.objetoId && a.key.toLowerCase() === buscada)
          .sort((a, b) => a.id - b.id)[0];
        return hit ? { id: hit.id } : null;
      },
    },
    funcionalidadObjetoAccion: {
      async findMany({ where }: any) {
        const ahora = new Date();
        return f.vinculos
          .filter((v) => {
            if (where.objetoId !== undefined && v.objetoId !== where.objetoId) return false;
            if (where.objetoAccionId !== undefined && v.objetoAccionId !== where.objetoAccionId) {
              return false;
            }
            if (where.funcionalidadId?.in && !where.funcionalidadId.in.includes(v.funcionalidadId)) {
              return false;
            }
            const fun = f.funcionalidades.find((x) => x.id === v.funcionalidadId);
            if (!fun) return false;
            const filtro = where.funcionalidad ?? {};
            if (filtro.aplicacionId !== undefined && fun.aplicacionId !== filtro.aplicacionId) {
              return false;
            }
            if (filtro.estado !== undefined && fun.estado !== filtro.estado) return false;
            // La vigencia viaja como el par OR/AND de `whereVigente`.
            if (filtro.OR || filtro.AND) {
              if (!vigente(fun.fechaDesde, fun.fechaHasta, ahora)) return false;
            }
            if (where.objeto) {
              const obj = f.objetos.find((o) => o.id === v.objetoId);
              if (!obj) return false;
              if (obj.aplicacionId !== where.objeto.aplicacionId) return false;
              if (obj.estado !== where.objeto.estado) return false;
            }
            return true;
          })
          .map((v) => {
            const fun = f.funcionalidades.find((x) => x.id === v.funcionalidadId)!;
            const obj = f.objetos.find((o) => o.id === v.objetoId)!;
            const acc = f.objetoAcciones.find((a) => a.id === v.objetoAccionId) ?? null;
            return {
              funcionalidadId: v.funcionalidadId,
              funcionalidad: { soloRoot: fun.soloRoot },
              objeto: { key: obj.key },
              objetoAccion: acc ? { key: acc.key } : null,
            };
          });
      },
    },
    acceso: {
      async findMany({ where }: any) {
        const ahora = new Date();
        return f.accesos
          .filter(
            (a) =>
              a.usuarioId === where.usuarioId &&
              where.efecto.in.includes(a.efecto) &&
              vigente(a.fechaDesde, a.fechaHasta, ahora),
          )
          .map((a) => ({ funcionalidadId: a.funcionalidadId }));
      },
    },
    usuarioRol: {
      async findMany({ where }: any) {
        const ahora = new Date();
        return f.usuarioRoles
          .filter(
            (r) =>
              r.usuarioId === where.usuarioId &&
              r.rolEstado === where.rol.estado &&
              vigente(r.fechaDesde, r.fechaHasta, ahora),
          )
          .map((r) => ({ rolId: r.rolId }));
      },
    },
    rolFuncionalidad: {
      async findMany({ where }: any) {
        return f.rolFuncionalidades
          .filter((r) => where.rolId.in.includes(r.rolId))
          .map((r) => ({ funcionalidadId: r.funcionalidadId }));
      },
    },
  };
  return cliente as unknown as ClientePrismaMotor;
}

// ─── Fixture: el andamiaje real, en chico ───────────────────────────────────
//
// Reproduce lo que hay sembrado en la base (agosto 2026): un objeto PAGE por
// pantalla con UNA acción `view`, y una funcionalidad por pantalla colgada de
// esa acción. Más el objeto `solicitudes` con su acción `approve`.

function fixtureBase(): Fixture {
  return {
    objetos: [
      { id: 20, aplicacionId: APP, key: "usuarios", estado: "A" },
      { id: 21, aplicacionId: APP, key: "roles", estado: "A" },
      { id: 4, aplicacionId: APP, key: "solicitudes", estado: "A" },
      // Objeto dado de baja: no puede otorgar nada.
      { id: 90, aplicacionId: APP, key: "objetos", estado: "I" },
      // Objeto con la misma key pero de OTRA aplicación: el motor no lo mira.
      { id: 91, aplicacionId: 3, key: "acciones", estado: "A" },
    ],
    objetoAcciones: [
      { id: 200, objetoId: 20, key: "view" },
      { id: 210, objetoId: 21, key: "view" },
      { id: 40, objetoId: 4, key: "approve" },
      { id: 900, objetoId: 90, key: "view" },
      { id: 910, objetoId: 91, key: "view" },
    ],
    funcionalidades: [
      { id: 51, aplicacionId: APP, estado: "A", soloRoot: "N", fechaDesde: null, fechaHasta: null },
      { id: 52, aplicacionId: APP, estado: "A", soloRoot: "N", fechaDesde: null, fechaHasta: null },
      { id: 30, aplicacionId: APP, estado: "A", soloRoot: "N", fechaDesde: null, fechaHasta: null },
      { id: 56, aplicacionId: APP, estado: "A", soloRoot: "N", fechaDesde: null, fechaHasta: null },
      { id: 55, aplicacionId: 3, estado: "A", soloRoot: "N", fechaDesde: null, fechaHasta: null },
    ],
    vinculos: [
      { funcionalidadId: 51, objetoId: 20, objetoAccionId: 200 },
      { funcionalidadId: 52, objetoId: 21, objetoAccionId: 210 },
      { funcionalidadId: 30, objetoId: 4, objetoAccionId: 40 },
      { funcionalidadId: 56, objetoId: 90, objetoAccionId: 900 },
      { funcionalidadId: 55, objetoId: 91, objetoAccionId: 910 },
    ],
    accesos: [],
    usuarioRoles: [],
    rolFuncionalidades: [],
  };
}

const ROOT: UsuarioAuth = {
  id: 1,
  username: "dmedaglia",
  esRootDeSecapi: true,
  aplicacionesRoot: [APP],
};
const COMUN: UsuarioAuth = {
  id: 3,
  username: "jperez",
  esRootDeSecapi: false,
  aplicacionesRoot: [],
};

const puede = (f: Fixture, objetoKey: string, accion = "view") =>
  usuarioTieneFuncionalidad(COMUN, objetoKey, accion, crearMotorPrisma(baseFalsa(f)));

// ─── Tests ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\nMotor de permisos de secapi sobre sí misma (src/lib/permisos.ts)\n");

  await test("sin nada otorgado: no pasa en ninguna pantalla", async () => {
    const f = fixtureBase();
    esperarIgual(await puede(f, "usuarios"), false, "usuarios");
    esperarIgual(await puede(f, "roles"), false, "roles");
    esperarIgual(await puede(f, "solicitudes", "approve"), false, "solicitudes");
  });

  await test("root pasa en todo, sin consultar la base", async () => {
    // El motor tira si le preguntan algo: root tiene que cortar antes.
    const motorQueExplota = crearMotorPrisma(
      new Proxy(
        {},
        {
          get() {
            throw new Error("root no debería consultar la base");
          },
        },
      ) as ClientePrismaMotor,
    );
    esperarIgual(
      await usuarioTieneFuncionalidad(ROOT, "usuarios", "view", motorQueExplota),
      true,
      "root",
    );
  });

  await test("otorgada POR ROL: pasa en SU pantalla y en ninguna otra", async () => {
    const f = fixtureBase();
    f.usuarioRoles.push({
      usuarioId: COMUN.id,
      rolId: 70,
      rolEstado: "A",
      fechaDesde: null,
      fechaHasta: null,
    });
    f.rolFuncionalidades.push({ rolId: 70, funcionalidadId: 51 }); // Usuarios

    esperarIgual(await puede(f, "usuarios"), true, "usuarios (la que le dieron)");
    esperarIgual(await puede(f, "roles"), false, "roles");
    esperarIgual(await puede(f, "solicitudes", "approve"), false, "solicitudes");
  });

  await test("otorgada por ACCESO DIRECTO: pasa igual que por rol", async () => {
    const f = fixtureBase();
    f.accesos.push({
      usuarioId: COMUN.id,
      funcionalidadId: 52, // Roles
      efecto: "grant",
      fechaDesde: null,
      fechaHasta: null,
    });

    esperarIgual(await puede(f, "roles"), true, "roles (la que le dieron)");
    esperarIgual(await puede(f, "usuarios"), false, "usuarios");
  });

  await test("un acceso con efecto 'deny' no otorga nada", async () => {
    const f = fixtureBase();
    f.accesos.push({
      usuarioId: COMUN.id,
      funcionalidadId: 51,
      efecto: "deny",
      fechaDesde: null,
      fechaHasta: null,
    });
    esperarIgual(await puede(f, "usuarios"), false, "usuarios");
  });

  await test("el otorgamiento de OTRO usuario no sirve", async () => {
    const f = fixtureBase();
    f.accesos.push({
      usuarioId: 999,
      funcionalidadId: 51,
      efecto: "grant",
      fechaDesde: null,
      fechaHasta: null,
    });
    esperarIgual(await puede(f, "usuarios"), false, "usuarios");
  });

  // ── Fail-closed en todos los bordes ───────────────────────────────────────

  await test("objeto INEXISTENTE: denegado", async () => {
    const f = fixtureBase();
    f.accesos.push({
      usuarioId: COMUN.id,
      funcionalidadId: 51,
      efecto: "grant",
      fechaDesde: null,
      fechaHasta: null,
    });
    esperarIgual(await puede(f, "pantalla-que-no-existe"), false, "objeto inventado");
  });

  await test("objeto INACTIVO: denegado aunque tenga la funcionalidad", async () => {
    const f = fixtureBase();
    f.accesos.push({
      usuarioId: COMUN.id,
      funcionalidadId: 56, // cuelga del objeto 90, estado "I"
      efecto: "grant",
      fechaDesde: null,
      fechaHasta: null,
    });
    esperarIgual(await puede(f, "objetos"), false, "objeto inactivo");
  });

  await test("objeto de OTRA aplicación: denegado (el motor solo mira secapi)", async () => {
    const f = fixtureBase();
    f.accesos.push({
      usuarioId: COMUN.id,
      funcionalidadId: 55,
      efecto: "grant",
      fechaDesde: null,
      fechaHasta: null,
    });
    esperarIgual(await puede(f, "acciones"), false, "objeto de la app 3");
  });

  await test("ACCIÓN inexistente: denegado (no se ensancha a 'cualquier acción')", async () => {
    // Este es el fail-open que tenía `usuarioPuedeAprobar`: si no encontraba la
    // objeto_accion, dejaba de filtrar por acción y aceptaba cualquier
    // funcionalidad colgada del objeto.
    const f = fixtureBase();
    f.accesos.push({
      usuarioId: COMUN.id,
      funcionalidadId: 51,
      efecto: "grant",
      fechaDesde: null,
      fechaHasta: null,
    });
    esperarIgual(await puede(f, "usuarios", "delete"), false, "acción que no existe");
    esperarIgual(await puede(f, "usuarios", ""), false, "acción vacía");
  });

  await test("funcionalidad INACTIVA: denegado", async () => {
    const f = fixtureBase();
    f.funcionalidades.find((x) => x.id === 51)!.estado = "I";
    f.accesos.push({
      usuarioId: COMUN.id,
      funcionalidadId: 51,
      efecto: "grant",
      fechaDesde: null,
      fechaHasta: null,
    });
    esperarIgual(await puede(f, "usuarios"), false, "funcionalidad inactiva");
  });

  await test("funcionalidad VENCIDA: denegado", async () => {
    const f = fixtureBase();
    f.funcionalidades.find((x) => x.id === 51)!.fechaHasta = AYER;
    f.accesos.push({
      usuarioId: COMUN.id,
      funcionalidadId: 51,
      efecto: "grant",
      fechaDesde: null,
      fechaHasta: null,
    });
    esperarIgual(await puede(f, "usuarios"), false, "funcionalidad vencida");
  });

  await test("funcionalidad solo_root='S': denegado a quien no es root", async () => {
    const f = fixtureBase();
    f.funcionalidades.find((x) => x.id === 51)!.soloRoot = "S";
    f.accesos.push({
      usuarioId: COMUN.id,
      funcionalidadId: 51,
      efecto: "grant",
      fechaDesde: null,
      fechaHasta: null,
    });
    esperarIgual(await puede(f, "usuarios"), false, "solo_root");
  });

  await test("acceso VENCIDO y rol VENCIDO: denegado", async () => {
    const f = fixtureBase();
    f.accesos.push({
      usuarioId: COMUN.id,
      funcionalidadId: 51,
      efecto: "grant",
      fechaDesde: null,
      fechaHasta: AYER,
    });
    f.usuarioRoles.push({
      usuarioId: COMUN.id,
      rolId: 70,
      rolEstado: "A",
      fechaDesde: MANANA,
      fechaHasta: null,
    });
    f.rolFuncionalidades.push({ rolId: 70, funcionalidadId: 52 });
    esperarIgual(await puede(f, "usuarios"), false, "acceso vencido");
    esperarIgual(await puede(f, "roles"), false, "rol que todavía no empezó");
  });

  await test("rol INACTIVO: denegado", async () => {
    const f = fixtureBase();
    f.usuarioRoles.push({
      usuarioId: COMUN.id,
      rolId: 70,
      rolEstado: "I",
      fechaDesde: null,
      fechaHasta: null,
    });
    f.rolFuncionalidades.push({ rolId: 70, funcionalidadId: 51 });
    esperarIgual(await puede(f, "usuarios"), false, "rol inactivo");
  });

  // ── `usuarioPuedeAprobar` es el mismo motor ───────────────────────────────

  await test("usuarioPuedeAprobar quedó siendo una consulta más al motor", async () => {
    const f = fixtureBase();
    const motor = crearMotorPrisma(baseFalsa(f));
    esperarIgual(await usuarioPuedeAprobar(COMUN, motor), false, "sin la funcionalidad");
    esperarIgual(await usuarioPuedeAprobar(ROOT, motor), true, "root siempre");

    f.accesos.push({
      usuarioId: COMUN.id,
      funcionalidadId: 30, // Solicitudes
      efecto: "grant",
      fechaDesde: null,
      fechaHasta: null,
    });
    esperarIgual(
      await usuarioPuedeAprobar(COMUN, crearMotorPrisma(baseFalsa(f))),
      true,
      "con la funcionalidad de aprobar",
    );
    // Y aprobar NO da administrar usuarios: son otorgamientos distintos.
    esperarIgual(await puede(f, "usuarios"), false, "aprobar no otorga usuarios");
  });

  await test("objetosAdministrablesDe: lo mínimo, y vacío para root", async () => {
    const f = fixtureBase();
    f.usuarioRoles.push({
      usuarioId: COMUN.id,
      rolId: 70,
      rolEstado: "A",
      fechaDesde: null,
      fechaHasta: null,
    });
    f.rolFuncionalidades.push({ rolId: 70, funcionalidadId: 51 });
    f.accesos.push({
      usuarioId: COMUN.id,
      funcionalidadId: 30,
      efecto: "grant",
      fechaDesde: null,
      fechaHasta: null,
    });

    const motor = crearMotorPrisma(baseFalsa(f));
    esperarIgual(
      await objetosAdministrablesDe(COMUN, motor),
      { solicitudes: ["approve"], usuarios: ["view"] },
      "lo que administra",
    );
    esperarIgual(await objetosAdministrablesDe(ROOT, motor), {}, "root no necesita la lista");
  });

  // ── Identidad ─────────────────────────────────────────────────────────────

  console.log("\nIdentidad no ambigua (elegirIdentidad / colisionesDeIdentidad)\n");

  const fila = (id: number, username: string, email: string | null): FilaIdentidad => ({
    id,
    username,
    email,
  });

  await test("camino feliz: un usuario normal resuelve igual que siempre", async () => {
    const r = elegirIdentidad([fila(1, "dmedaglia", "dmedaglia@riogas.com.uy")], "dmedaglia");
    esperar(r.ok, "tendría que resolver");
    if (r.ok) esperarIgual(r.usuario.id, 1, "id");
  });

  await test("camino feliz: también resuelve por email, y sin distinguir mayúsculas", async () => {
    const filas = [fila(1, "dmedaglia", "dmedaglia@riogas.com.uy")];
    const porMail = elegirIdentidad(filas, "DMedaglia@Riogas.Com.Uy");
    esperar(porMail.ok, "por email");
    const conEspacios = elegirIdentidad(filas, "  DMEDAGLIA  ");
    esperar(conEspacios.ok, "con espacios y en mayúsculas");
  });

  await test("nadie matchea: SIN_COINCIDENCIA", async () => {
    const r = elegirIdentidad([], "fantasma");
    esperar(!r.ok, "no tendría que resolver");
    if (!r.ok) esperarIgual(r.motivo, "SIN_COINCIDENCIA", "motivo");
  });

  await test("EL ATAQUE: mi username es el email del root → gana el match por username", async () => {
    /*
     * El atacante da de alta un usuario cuyo `username` sea el EMAIL de
     * dmedaglia. A partir de ahí, un token que diga ese string matchea DOS
     * filas: la del atacante (por username) y la del root (por email).
     *
     * Con el `findFirst` sin `orderBy` que había, Postgres devolvía cualquiera
     * de las dos. Ahora gana el match exacto por USERNAME —que es la identidad
     * primaria, la que pide el login— así que resuelve al atacante, con sus
     * propios permisos, y nunca al root.
     */
    const filas = [
      fila(1, "dmedaglia", "dmedaglia@riogas.com.uy"),
      fila(500, "dmedaglia@riogas.com.uy", "atacante@ejemplo.com"),
    ];
    const r = elegirIdentidad(filas, "dmedaglia@riogas.com.uy");
    esperar(r.ok, "hay un match por username: se puede decidir");
    if (r.ok) {
      esperarIgual(r.usuario.id, 500, "tiene que resolver al dueño del username, no al del email");
    }
  });

  await test("dos filas y NINGUNA por username: RECHAZO (identidad ambigua)", async () => {
    // Ninguna forma honesta de elegir. Antes se devolvía una de las dos.
    const filas = [
      fila(1, "juan", "compartido@ejemplo.com"),
      fila(2, "pedro", "compartido@ejemplo.com"),
    ];
    const r = elegirIdentidad(filas, "compartido@ejemplo.com");
    esperar(!r.ok, "no se puede elegir");
    if (!r.ok) {
      esperarIgual(r.motivo, "IDENTIDAD_AMBIGUA", "motivo");
      esperarIgual(r.candidatos, [1, 2], "candidatos, para poder auditarlo");
    }
  });

  await test("dos usernames que difieren solo en mayúsculas: RECHAZO", async () => {
    // El unique de `username` es case-SENSITIVE en Postgres y la búsqueda es
    // case-insensitive: estas dos filas son legales y matchean las dos.
    const r = elegirIdentidad([fila(1, "Juan", null), fila(2, "juan", null)], "juan");
    esperar(!r.ok, "no se puede elegir");
    if (!r.ok) esperarIgual(r.motivo, "IDENTIDAD_AMBIGUA", "motivo");
  });

  await test("colisión de alta: username que es el email de otro", async () => {
    const existentes = [fila(1, "dmedaglia", "dmedaglia@riogas.com.uy")];
    const choca = colisionesDeIdentidad(existentes, {
      username: "DMedaglia@Riogas.Com.Uy",
      email: "nuevo@ejemplo.com",
    });
    esperarIgual(
      choca.map((c) => c.id),
      [1],
      "tiene que detectar el cruce username↔email",
    );
  });

  await test("colisión de alta: email que es el username de otro", async () => {
    const existentes = [fila(1, "despacho", null)];
    const choca = colisionesDeIdentidad(existentes, { username: "nuevo", email: " Despacho " });
    esperarIgual(choca.map((c) => c.id), [1], "el cruce va en los dos sentidos");
  });

  await test("sin colisión: un alta normal no se bloquea", async () => {
    const existentes = [fila(1, "dmedaglia", "dmedaglia@riogas.com.uy")];
    esperarIgual(
      colisionesDeIdentidad(existentes, { username: "jgomez", email: "jgomez@riogas.com.uy" }),
      [],
      "no tiene que rechazar un alta común",
    );
    esperarIgual(
      colisionesDeIdentidad(existentes, { username: "", email: null }),
      [],
      "sin valores no hay nada que chequear",
    );
  });

  // ── Resultado ─────────────────────────────────────────────────────────────

  console.log(
    `\n${pasaron} ok, ${fallaron.length} fallidos${fallaron.length ? ": " + fallaron.join(", ") : ""}\n`,
  );
  if (fallaron.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
