/**
 * scripts/bootstrap-root.ts
 *
 * La escalera de incendio: restituye el rol Root de SecuritySuite desde la
 * línea de comandos, con las credenciales de la base y sin pasar por la API.
 *
 *   pnpm bootstrap:root                      # diagnóstico: quién es root hoy
 *   pnpm bootstrap:root -- --usuario jgomez  # le da el rol Root de secapi
 *   pnpm bootstrap:root -- --usuario jgomez --aplicacion 3
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * Desde que root dejó de ser `usuarios.es_root` y pasó a ser el ROL "Root",
 * todo lo que otorga permisos está en nivel ROOT del guard (POLITICAS, en
 * src/lib/auth/apiGuard.ts). Eso cierra la escalada —cualquiera de los 854
 * usuarios se hacía root con un request— pero crea el problema simétrico: si
 * el sistema se queda sin ningún root, NO HAY forma de volver por la
 * aplicación, porque para otorgar el rol Root hay que ser root.
 *
 * Los handlers tienen redes de contención (`verificarQueQuedaRoot`) que
 * rechazan las operaciones que dejarían cero roots, pero no cubren todo: una
 * corrección a mano en la base, una restauración de un backup viejo, un rol
 * renombrado por SQL. Este script es el camino de vuelta para esos casos, y la
 * razón por la que subir esos endpoints a ROOT no deja el sistema irrecuperable.
 *
 * Es el equivalente de la consola del servidor: quien lo puede correr ya tiene
 * DATABASE_URL, o sea que ya podía hacer esto con un INSERT. La diferencia es
 * que acá se hace con el MISMO criterio que usa el código para leer root
 * (nombre del rol normalizado, rol activo, aplicación activa, vigencia), en vez
 * de a mano y a ojo.
 *
 * NO toca `usuarios.es_root`: esa columna no autoriza nada.
 */

import { prisma } from "../src/lib/prisma";
import {
  aplicacionIdDeSecapi,
  esRolRoot,
  NOMBRE_ROL_ROOT,
  usuariosRootDeSecapi,
} from "../src/lib/permisos";

interface Opciones {
  usuario: string | null;
  aplicacionId: number;
  ayuda: boolean;
}

function parsearArgs(argv: string[]): Opciones {
  const opciones: Opciones = {
    usuario: null,
    aplicacionId: aplicacionIdDeSecapi(),
    ayuda: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opciones.ayuda = true;
    else if (a === "--usuario" || a === "-u") opciones.usuario = argv[++i] ?? null;
    else if (a === "--aplicacion" || a === "-a") opciones.aplicacionId = Number(argv[++i]);
  }
  return opciones;
}

function ayuda(): void {
  console.log(`
bootstrap-root — restituye el rol Root cuando ya no se puede desde la aplicación

  pnpm bootstrap:root                          diagnóstico, no escribe nada
  pnpm bootstrap:root -- --usuario <username>  asigna el rol Root de secapi
  pnpm bootstrap:root -- -u <username> -a <id> asigna el Root de otra aplicación

Opciones:
  -u, --usuario     username (o email) del usuario que va a quedar root
  -a, --aplicacion  id de aplicación; por defecto ${aplicacionIdDeSecapi()} (SecuritySuite)
  -h, --help        esto

El usuario tiene que existir y estar en estado 'A'. El rol "Root" de esa
aplicación tiene que existir y estar activo: el script NO lo crea, porque crear
un rol llamado "Root" es exactamente la fabricación de privilegio que este
cambio vino a cerrar, y hacerlo a ciegas taparía el problema real (que el rol se
haya renombrado o desactivado) en vez de mostrarlo.
`);
}

/** Foto de en qué estado está el root ahora mismo, con el criterio del código. */
async function diagnostico(aplicacionId: number): Promise<void> {
  const app = await prisma.aplicacion.findUnique({
    where: { id: aplicacionId },
    select: { id: true, nombre: true, estado: true },
  });

  console.log(`\nAplicación ${aplicacionId}: ${app ? `${app.nombre} (estado ${app.estado})` : "NO EXISTE"}`);
  if (app && app.estado !== "A") {
    console.log(
      "  ⚠ La aplicación está INACTIVA. Sus roles Root no otorgan nada " +
        "(ver aplicacionesRootDe en src/lib/permisos.ts). Si es la aplicación 1, " +
        "NADIE es root hasta que vuelva a estado 'A'.",
    );
  }

  const roles = await prisma.rol.findMany({
    where: { aplicacionId },
    select: { id: true, nombre: true, estado: true },
  });
  const rolesRoot = roles.filter((r) => esRolRoot(r.nombre));
  if (rolesRoot.length === 0) {
    console.log(
      `  ⚠ No hay ningún rol llamado "${NOMBRE_ROL_ROOT}" en esta aplicación. ` +
        "Alguien lo renombró o lo borró: sin ese rol no hay root posible.",
    );
  } else {
    for (const r of rolesRoot) {
      console.log(`  rol Root: id=${r.id} nombre="${r.nombre}" estado=${r.estado}`);
      if (r.estado !== "A") console.log("    ⚠ INACTIVO: no otorga root.");
    }
  }

  const rootsIds = await usuariosRootDeSecapi();
  const roots = rootsIds.length
    ? await prisma.usuario.findMany({
        where: { id: { in: rootsIds } },
        select: { id: true, username: true },
      })
    : [];

  console.log(
    `\nRoots VIGENTES de SecuritySuite (${aplicacionIdDeSecapi()}): ` +
      (roots.length ? roots.map((u) => `${u.username} (${u.id})`).join(", ") : "NINGUNO"),
  );
  if (roots.length === 0) {
    console.log(
      "  ⚠ El sistema NO tiene administrador. Corré este script con --usuario <username>.",
    );
  }
  console.log("");
}

async function otorgar(username: string, aplicacionId: number): Promise<number> {
  const usuario = await prisma.usuario.findFirst({
    where: {
      OR: [
        { username: { equals: username.trim(), mode: "insensitive" } },
        { email: { equals: username.trim(), mode: "insensitive" } },
      ],
    },
    select: { id: true, username: true, estado: true },
  });

  if (!usuario) {
    console.error(`✗ No existe ningún usuario con username o email "${username}".`);
    return 1;
  }
  if (usuario.estado !== "A") {
    console.error(
      `✗ El usuario ${usuario.username} (${usuario.id}) está en estado '${usuario.estado}'. ` +
        "resolveUsuario solo autentica usuarios activos, así que darle el rol no serviría de nada. " +
        "Activalo primero.",
    );
    return 1;
  }

  const app = await prisma.aplicacion.findUnique({
    where: { id: aplicacionId },
    select: { id: true, nombre: true, estado: true },
  });
  if (!app) {
    console.error(`✗ No existe la aplicación ${aplicacionId}.`);
    return 1;
  }
  if (app.estado !== "A") {
    console.error(
      `✗ La aplicación ${app.nombre} (${app.id}) está inactiva: sus roles no otorgan nada. ` +
        "Pasala a estado 'A' primero.",
    );
    return 1;
  }

  const roles = await prisma.rol.findMany({
    where: { aplicacionId, estado: "A" },
    select: { id: true, nombre: true },
  });
  const rolRoot = roles.find((r) => esRolRoot(r.nombre));
  if (!rolRoot) {
    console.error(
      `✗ La aplicación ${app.nombre} no tiene un rol activo llamado "${NOMBRE_ROL_ROOT}". ` +
        "El script no lo crea a propósito: averiguá si lo renombraron o lo desactivaron.",
    );
    return 1;
  }

  // Sin fechas: vigente para siempre, que es como están las asignaciones de los
  // roots de producción. Un `upsert` y no un `create` para que correrlo dos
  // veces no explote ni pise fechas puestas a mano.
  await prisma.usuarioRol.upsert({
    where: { usuarioId_rolId: { usuarioId: usuario.id, rolId: rolRoot.id } },
    update: { fechaDesde: null, fechaHasta: null },
    create: { usuarioId: usuario.id, rolId: rolRoot.id, fechaDesde: null, fechaHasta: null },
  });

  console.log(
    `✓ ${usuario.username} (${usuario.id}) quedó con el rol "${rolRoot.nombre}" ` +
      `(${rolRoot.id}) de ${app.nombre} (${app.id}), sin fechas de vigencia.`,
  );
  return 0;
}

async function main(): Promise<void> {
  const opciones = parsearArgs(process.argv.slice(2));
  if (opciones.ayuda) {
    ayuda();
    return;
  }

  if (!Number.isFinite(opciones.aplicacionId) || opciones.aplicacionId <= 0) {
    console.error("✗ --aplicacion tiene que ser un id numérico.");
    process.exitCode = 1;
    return;
  }

  if (opciones.usuario) {
    process.exitCode = await otorgar(opciones.usuario, opciones.aplicacionId);
  }

  // El diagnóstico va SIEMPRE y al final: después de otorgar, confirma con el
  // criterio real del código que el sistema quedó con root de verdad. Es la
  // diferencia entre "el INSERT no dio error" y "andá y probá entrar".
  await diagnostico(opciones.aplicacionId);
}

main()
  .catch((error) => {
    console.error("[bootstrap-root]", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
