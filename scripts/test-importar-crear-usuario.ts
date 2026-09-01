/*
 * ============================================================================
 * crearUsuario — tests de caracterización
 * ============================================================================
 *
 * Esta función es la que da de alta a un usuario externo en PG, y hasta ahora
 * vivía adentro del handler de `POST /api/db/usuarios/importar` sin un solo
 * test: ninguna de las suites la importaba porque era privada del módulo de la
 * ruta. Se movió a `src/lib/usuarios/importar.ts` para que el job horario de
 * sync la reuse, y estos tests se escribieron ANTES de moverla: fijan el
 * comportamiento que el wizard del panel ya tiene hoy, para que la mudanza no
 * lo cambie sin que nadie se entere.
 *
 * Lo que se fija acá es de lo que dependen los dos consumidores: minúsculas en
 * el username, `password: ""`, el mapeo habilitado→estado (el que permite
 * importar los 759 deshabilitados de ADMSEC), los tres chequeos de colisión que
 * devuelven "omitido" sin escribir, el dry-run que no escribe, el truncado a
 * los anchos reales de columna y el catch que convierte un error de Prisma en
 * una fila de resultado en vez de reventar el lote entero.
 *
 * NO toca la base: se le inyecta un doble por el parámetro `cliente`. Es
 * obligatorio que no la toque — dev y prod apuntan a la MISMA Postgres de
 * producción (854 usuarios reales), así que un test que escriba no es una
 * opción.
 */
import { crearUsuario, type ClienteCrearUsuario } from "@/lib/usuarios/importar";
import type { ExternalUser } from "@/lib/usuarios/tipos";

// ─── Mini framework de aserciones ───────────────────────────────────────────

let pasaron = 0;
const fallaron: string[] = [];

async function test(nombre: string, fn: () => Promise<void>): Promise<void> {
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

function esperarIgual(actual: unknown, esperado: unknown, que: string): void {
  if (actual !== esperado) {
    throw new Error(`${que}: esperaba ${JSON.stringify(esperado)}, vino ${JSON.stringify(actual)}`);
  }
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

function externo(over: Partial<ExternalUser> = {}): ExternalUser {
  return {
    origen: "GSIST",
    // En MAYÚSCULAS a propósito: así vienen los usernames del AS400.
    username: "SACUNA",
    nombre: null,
    email: null,
    habilitado: true,
    esCuentaSistema: false,
    extras: {},
    ...over,
  };
}

const OPTS = {
  conPreferencias: false,
  conRoles: false,
  creadoPor: "sync-admsec",
  dryRun: false,
};

/**
 * Doble del cliente. `busquedas` y `creados` registran las llamadas, que es lo
 * único que importa: que no escriba cuando no tiene que escribir.
 */
function doble(
  opciones: {
    porUsername?: { id: number; username: string } | null;
    porEmail?: { username: string } | null;
    colisiones?: Array<{ id: number; username: string; email: string | null }>;
    createFalla?: Error;
  } = {},
) {
  const busquedas: any[] = [];
  const creados: any[] = [];
  const cliente = {
    usuario: {
      findFirst: async (args: any) => {
        busquedas.push(args);
        if (args?.where?.username) return opciones.porUsername ?? null;
        if (args?.where?.email) return opciones.porEmail ?? null;
        return null;
      },
      // La usa `buscarColisionesDeIdentidad`: es nada más el prefiltro, el
      // criterio real lo aplica después la función pura.
      findMany: async () => opciones.colisiones ?? [],
      create: async (args: any) => {
        creados.push(args);
        if (opciones.createFalla) throw opciones.createFalla;
        return { id: 1234, username: args.data.username };
      },
    },
  } as unknown as ClienteCrearUsuario;
  return { cliente, busquedas, creados };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\ncrearUsuario — alta de un usuario externo\n");

  await test("el username se escribe en MINÚSCULAS aunque el origen lo mande en mayúsculas", async () => {
    const d = doble();
    const r = await crearUsuario(externo({ username: "SACUNA" }), OPTS, d.cliente);
    esperarIgual(r.estado, "creado", "estado");
    esperarIgual(d.creados.length, 1, "cantidad de creates");
    esperarIgual(d.creados[0].data.username, "sacuna", "username escrito");
    // El detalle que se le devuelve al operador va con el username original:
    // es el que vio en la grilla.
    esperarIgual(r.username, "SACUNA", "username del detalle");
  });

  await test("password se escribe como string vacío", async () => {
    const d = doble();
    await crearUsuario(externo(), OPTS, d.cliente);
    esperarIgual(d.creados[0].data.password, "", "password");
  });

  await test("habilitado true → estado 'A'", async () => {
    const d = doble();
    await crearUsuario(externo({ habilitado: true }), OPTS, d.cliente);
    esperarIgual(d.creados[0].data.estado, "A", "estado");
  });

  await test("habilitado false → estado 'I' (así se importan los deshabilitados)", async () => {
    const d = doble();
    await crearUsuario(externo({ habilitado: false }), OPTS, d.cliente);
    esperarIgual(d.creados[0].data.estado, "I", "estado");
  });

  await test("marca la fila como externa: esExterno, tipoUsuario, usuarioExterno, desdeSistema y creadoPor", async () => {
    const d = doble();
    await crearUsuario(
      externo({ username: "SACUNA", origen: "LDAP" }),
      { ...OPTS, creadoPor: "import:jgomez" },
      d.cliente,
    );
    const data = d.creados[0].data;
    esperarIgual(data.esExterno, "S", "esExterno");
    esperarIgual(data.tipoUsuario, "E", "tipoUsuario");
    // usuarioExterno guarda el username ORIGINAL, sin bajar a minúsculas: es
    // con el que se valida contra la fuente.
    esperarIgual(data.usuarioExterno, "SACUNA", "usuarioExterno");
    esperarIgual(data.desdeSistema, "LDAP", "desdeSistema");
    esperarIgual(data.creadoPor, "import:jgomez", "creadoPor");
  });

  await test("si ya existe ese username (sin mirar mayúsculas) → omitido y NO crea", async () => {
    const d = doble({ porUsername: { id: 7, username: "sacuna" } });
    const r = await crearUsuario(externo({ username: "SACUNA" }), OPTS, d.cliente);
    esperarIgual(r.estado, "omitido", "estado");
    esperarIgual(r.motivo, 'Ya existe como "sacuna"', "motivo");
    esperarIgual(d.creados.length, 0, "no puede haber creado nada");
    esperarIgual(d.busquedas[0]?.where?.username?.mode, "insensitive", "la búsqueda ignora mayúsculas");
    esperarIgual(d.busquedas[0]?.where?.username?.equals, "SACUNA", "busca el username original");
  });

  await test("si el email ya lo tiene otro → omitido y NO crea", async () => {
    const d = doble({ porEmail: { username: "jperez" } });
    const r = await crearUsuario(
      externo({ username: "NUEVO", email: "jperez@riogas.com.uy" }),
      OPTS,
      d.cliente,
    );
    esperarIgual(r.estado, "omitido", "estado");
    esperarIgual(r.motivo, 'El email ya lo tiene "jperez"', "motivo");
    esperarIgual(d.creados.length, 0, "no puede haber creado nada");
  });

  await test("colisión CRUZADA username↔email → omitido y NO crea", async () => {
    // El username que se importa es el EMAIL de otro usuario: los dos chequeos
    // anteriores no lo ven, y el token de uno terminaría matcheando dos filas.
    const d = doble({
      colisiones: [{ id: 9, username: "ana", email: "ana@riogas.com.uy" }],
    });
    const r = await crearUsuario(
      externo({ username: "ANA@RIOGAS.COM.UY", email: null }),
      OPTS,
      d.cliente,
    );
    esperarIgual(r.estado, "omitido", "estado");
    esperarIgual(
      r.motivo,
      'Choca con la identidad de "ana" (el usuario de uno es el mail del otro)',
      "motivo",
    );
    esperarIgual(d.creados.length, 0, "no puede haber creado nada");
  });

  await test("dryRun → devuelve creado con motivo 'dry-run' y NO llama a create", async () => {
    const d = doble();
    const r = await crearUsuario(externo(), { ...OPTS, dryRun: true }, d.cliente);
    esperarIgual(r.estado, "creado", "estado");
    esperarIgual(r.motivo, "dry-run", "motivo");
    esperarIgual(d.creados.length, 0, "el dry-run no puede escribir");
  });

  await test("nombre, apellido y email se truncan a los anchos de columna (60/60/120)", async () => {
    const d = doble();
    const nombreLargo = `${"A".repeat(70)} ${"B".repeat(70)}`;
    const emailLargo = `${"x".repeat(130)}@riogas.com.uy`;
    await crearUsuario(externo({ nombre: nombreLargo, email: emailLargo }), OPTS, d.cliente);
    const data = d.creados[0].data;
    esperarIgual(data.nombre.length, 60, "largo de nombre");
    esperarIgual(data.apellido.length, 60, "largo de apellido");
    esperarIgual(data.email.length, 120, "largo de email");
  });

  await test("un error de Prisma sale como estado 'error' con el último renglón, y NO se propaga", async () => {
    const d = doble({
      createFalla: new Error(
        "Invalid `prisma.usuario.create()` invocation:\n\n  Unique constraint failed on the fields: (`email`)  ",
      ),
    });
    const r = await crearUsuario(externo(), OPTS, d.cliente);
    esperarIgual(r.estado, "error", "estado");
    esperarIgual(r.motivo, "Unique constraint failed on the fields: (`email`)", "motivo");
    esperarIgual(r.username, "SACUNA", "username del detalle");
  });

  console.log(
    `\n${pasaron} ok, ${fallaron.length} fallidos${fallaron.length ? `: ${fallaron.join(", ")}` : ""}\n`,
  );
  if (fallaron.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
