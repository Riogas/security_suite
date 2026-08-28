import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verificarJwtConSecretoDelAmbiente } from "@/lib/auth/verificarJwt";

// =====================================================================
// Helpers compartidos de permisos / accesos (Postgres).
// Usados por /api/db/permisos, /api/db/solicitudes y el flujo de
// aprobación. Centraliza: extracción de JWT, resolución de usuario,
// normalización del campo `efecto` y el gating de aprobadores.
// =====================================================================

// El campo `accesos.efecto` quedó inconsistente históricamente: el modal
// "Asignar Funcionalidades" guarda "grant"/"deny" pero datos legacy y el
// default del schema usan "ALLOW". Se normaliza el lado lectura aceptando
// ambos. El flujo nuevo escribe siempre "grant"/"deny".
export const EFECTOS_ALLOW = ["grant", "GRANT", "ALLOW", "allow"];
export const EFECTOS_DENY = ["deny", "DENY"];
export const EFECTO_GRANT = "grant";
export const EFECTO_DENY = "deny";

// Objeto + acción que designan a un usuario como aprobador de solicitudes.
export const APROBADOR_OBJETO_KEY = "solicitudes";
export const APROBADOR_ACCION_KEY = "approve";

// Acá vivía `decodeJwt`, que hacía `JSON.parse(atob(partes[1]))`: leía el
// payload sin mirar la firma ni `exp`. Con eso, "Bearer <lo-que-sea>.<base64 de
// {"username":"dmedaglia"}>.<x>" entraba como root a todo lo que dependiera de
// `resolveUsuario` — y de ahí colgaban /api/db/permisos (el gate de CADA
// pantalla de Goya y TrackMovil), las solicitudes y su aprobación.
//
// No se reemplazó por otro decodificador: la verificación completa (firma HS256,
// vencimiento, secreto real y no el default del código) está en
// `@/lib/auth/verificarJwt` y es la ÚNICA puerta. Si necesitás el payload,
// llamá a `verificarJwtConSecretoDelAmbiente`; si necesitás el usuario,
// `resolveUsuario`. Volver a poner un `atob` acá reabre el agujero entero.

export function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return req.cookies.get("token")?.value ?? null;
}

// =====================================================================
// Root por ROL, y no por la columna `usuarios.es_root`
// =====================================================================
//
// Hasta acá "ser root" era `usuarios.es_root = 'S'`: una columna, un flag
// GLOBAL que bypaseaba de una sola vez el motor de permisos de las CUATRO
// aplicaciones. El dueño lo cortó: root pasa a ser tener asignado el ROL
// llamado "Root", que existe UNO POR APLICACIÓN.
//
// El ALCANCE, que es lo que el dueño definió textualmente ("que sea ese el rol
// válido para decir que somos root y tenemos acceso a todo básicamente"):
//
//   - El rol Root de SECAPI (aplicación 1) es el superusuario del ECOSISTEMA.
//     Vale para todo: el nivel ROOT del guard, /docs, y el bypass del motor de
//     permisos y del menú de CUALQUIER aplicación. Es el mismo alcance que
//     tenía `es_root='S'`, pero colgado del rol.
//   - Cada aplicación además reconoce SU propio rol Root para lo suyo: el Root
//     de GOYA bypasea GOYA y nada más.
//
// La granularidad por aplicación no se tiró: sigue viva en `aplicacionesRoot`,
// que es el detalle auditable de quién tiene qué. Lo que se decidió es que
// secapi, siendo la herramienta donde se configura quién es root de qué, no
// puede fingir que su root no alcanza a las demás. El razonamiento largo está
// en `esRootDeAplicacion`.
//
// Por qué, con los datos de producción medidos en agosto de 2026:
//
//   - De 854 usuarios, UNO solo tenía `es_root='S'` (dmedaglia). El resto de la
//     gente que administra el sistema no lo tenía, así que el flag ya no
//     describía a nadie: describía a una persona.
//   - El rol "Root" sí existe por aplicación y sí está asignado a quien
//     corresponde (ids 57 SecuritySuite, 55 GOYA, 52 RiogasTracking, 60 Granel).
//   - Y el flag que veía el NAVEGADOR ni siquiera salía de Postgres: el login
//     del panel va por el passthrough a GeneXus, que devuelve
//     SERVICIOS.USEREXTENDED.USEREXTENDEDESROOT — un campo distinto, en otra
//     base, que además está INVERTIDO respecto de esta columna. Resultado: el
//     mismo usuario era root para el endpoint y no-root para el botón. Con el
//     rol hay una sola fuente y las dos puntas preguntan lo mismo.
//
// La columna `es_root` SE QUEDA en el schema (la muestra la ficha, la leen
// scripts viejos), pero no autoriza nada. Por eso `UsuarioAuth` ya ni la trae:
// si alguien vuelve a colgar una decisión de autorización de ella, no compila.
//
// El rol se identifica por NOMBRE + aplicación, nunca por id hardcodeado: los
// ids son distintos en cada aplicación y en otra base van a ser otros. Ojo con
// `PG_ROL_ROOT_ID` (applyScenarioFilter.ts / applyAdmsecGroupRoles.ts): ese
// default 52 es el Root de TrackMovil y NO sirve para esto.
//
// ── La contrapartida obligatoria del cambio ──────────────────────────────────
//
// Mover el privilegio a `usuario_roles` sin más lo REGALA: ese es el precio de
// que el privilegio pase a vivir en una tabla de datos. Antes `es_root` estaba
// protegido por `PUT /usuarios/:id`, que exigía ser root para tocarlo; el rol,
// en cambio, lo escribían endpoints de nivel AUTENTICADA, o sea cualquiera de
// los 854 usuarios con una sesión normal:
//
//   PUT  /api/db/usuarios/<yo>/roles  { "roles": [{ "rolId": 57 }] }   → root
//   POST /api/db/roles  { "aplicacionId": 1, "nombre": "root" }        → root
//
// (el segundo funciona porque el rol se identifica por NOMBRE, así que fabricar
// un rol llamado "Root" es fabricar el privilegio). Por eso, en el mismo
// cambio, todo lo que puede alterar quién tiene qué —asignación de roles, ABM
// de roles, accesos directos, funcionalidades, objetos, aplicaciones y el
// builder de menú— subió a nivel ROOT en `POLITICAS` (src/lib/auth/apiGuard.ts).
// Si alguna de esas rutas vuelve a AUTENTICADA, este modelo entero deja de
// tener sentido.

/** Nombre del rol, ya normalizado (minúsculas, sin espacios en los bordes). */
export const NOMBRE_ROL_ROOT = "root";

/** ¿Este nombre de rol es el rol Root? Case-insensitive y tolerante a espacios. */
export function esRolRoot(nombre: string | null | undefined): boolean {
  return String(nombre ?? "").trim().toLowerCase() === NOMBRE_ROL_ROOT;
}

/**
 * Aplicación SecuritySuite. Sale de env (la MISMA variable que ya usan
 * `resolveAplicacionId` y el guard de /docs — no se inventa una nueva) con
 * default 1.
 *
 * Ojo con lo que este `Number(process.env...)` NO garantiza: `NEXT_PUBLIC_*`
 * lo INLINEA Next en el build, así que en la app desplegada el valor queda
 * horneado en el bundle y cambiar la variable del ambiente no lo mueve (haría
 * falta rebuild). El fallback a `APLICACION_ID` sí se lee en runtime, pero solo
 * llega a evaluarse si `NEXT_PUBLIC_APLICACION_ID` no estaba al compilar.
 *
 * Se deja como función igual (y no como constante de módulo) por los tests, que
 * la ejercitan cambiando la env, y porque en los scripts `tsx` no hay inlineado
 * y ahí sí se relee. Lo que no hay que hacer es prometer que un cambio de
 * ambiente se toma en caliente: no es cierto en la app desplegada.
 */
export function aplicacionIdDeSecapi(): number {
  const n = Number(process.env.NEXT_PUBLIC_APLICACION_ID ?? process.env.APLICACION_ID ?? 1);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Una fila de `usuario_roles` con lo justo para decidir si es un Root vigente. */
export interface AsignacionDeRol {
  fechaDesde: Date | null;
  fechaHasta: Date | null;
  rol: {
    nombre: string;
    estado: string;
    aplicacionId: number;
    /**
     * La aplicación dueña del rol. Va acá y no como `aplicacionEstado` suelto
     * para que el `select` de Prisma y este tipo tengan la misma forma, y es
     * OBLIGATORIO a propósito: si alguien agrega otra consulta de roles y se
     * olvida de traer el estado de la aplicación, no compila. Un rol Root de
     * una aplicación dada de baja no puede seguir otorgando root.
     */
    aplicacion: { estado: string };
  };
}

/**
 * ¿La asignación está vigente ahora? `usuario_roles` tiene `fecha_desde` y
 * `fecha_hasta` (las dos nullable): una asignación VENCIDA, o que todavía no
 * empezó, no puede contar como root.
 *
 * El criterio (`desde <= ahora <= hasta`) es exactamente el mismo que usan
 * `POST /api/db/permisos` y `usuarioPuedeAprobar`. Se copia a propósito: si
 * acá se usara otro, un usuario podría ser root para el guard y no serlo para
 * el motor de permisos el último día de su asignación, que es la clase de
 * incoherencia más cara de diagnosticar.
 *
 * Rareza CONOCIDA y asumida: las dos columnas son `@db.Date`, así que Prisma
 * las devuelve a las 00:00 UTC del día. Una asignación con `fecha_hasta` = HOY
 * deja de valer a las 00:00 UTC, o sea a las 21:00 de AYER en hora de Uruguay
 * (UTC-3): el último día se pierde. NO se corrige acá (sumarle un día, o
 * comparar solo la parte fecha) porque el motor de permisos, `usuarioPuedeAprobar`
 * y el menú hacen la misma comparación en SQL y no se pueden cambiar los cuatro
 * en el mismo movimiento sin arriesgar el endpoint más caliente del ecosistema.
 * Divergir sería peor que la rareza: dejaría a alguien root para el guard y
 * no-root para el motor durante tres horas. Si algún día se arregla, se arregla
 * en los cuatro lugares a la vez.
 */
export function asignacionVigente(
  asignacion: Pick<AsignacionDeRol, "fechaDesde" | "fechaHasta">,
  ahora: Date,
): boolean {
  const t = ahora.getTime();
  if (asignacion.fechaDesde && asignacion.fechaDesde.getTime() > t) return false;
  if (asignacion.fechaHasta && asignacion.fechaHasta.getTime() < t) return false;
  return true;
}

/**
 * Ids de las aplicaciones en las que el usuario es root, a partir de sus
 * asignaciones de rol. Función pura: es el corazón del cambio y por eso se
 * testea sola (`scripts/test-root-por-rol.ts`), sin base de por medio.
 *
 * Descarta, en este orden: el rol que no se llama "Root", el rol INACTIVO
 * (`roles.estado != 'A'`), la APLICACIÓN inactiva (`aplicaciones.estado != 'A'`)
 * y la asignación fuera de vigencia.
 *
 * Lo de la aplicación inactiva no estaba y se agrega acá: si una aplicación se
 * da de baja, su rol Root no puede seguir abriendo su menú ni su motor de
 * permisos. OJO con el efecto colateral, que es la razón de que
 * `POST|PUT|DELETE /api/db/aplicaciones` haya subido a nivel ROOT: dar de baja
 * la aplicación SecuritySuite deja al sistema SIN NINGÚN root, y de ahí solo se
 * vuelve por `scripts/bootstrap-root.ts`.
 */
export function aplicacionesRootDe(
  asignaciones: readonly AsignacionDeRol[],
  ahora: Date = new Date(),
): number[] {
  const ids = new Set<number>();
  for (const a of asignaciones) {
    if (!esRolRoot(a.rol?.nombre)) continue;
    if (String(a.rol?.estado ?? "").trim().toUpperCase() !== "A") continue;
    if (String(a.rol?.aplicacion?.estado ?? "").trim().toUpperCase() !== "A") continue;
    if (!asignacionVigente(a, ahora)) continue;
    ids.add(a.rol.aplicacionId);
  }
  return [...ids].sort((x, y) => x - y);
}

/**
 * `select` de Prisma con lo mínimo para calcular root. El filtrado (nombre,
 * estado, vigencia) se hace en JS y no en el `where` a propósito: el nombre hay
 * que compararlo con trim, y Prisma no puede trimear del lado del servidor sin
 * SQL crudo. Un usuario tiene un puñado de roles, así que traerlos todos no
 * cuesta nada y deja UNA sola implementación del criterio — la de
 * `aplicacionesRootDe`, que además es la que se testea.
 */
export const SELECT_ASIGNACIONES_ROL = {
  fechaDesde: true,
  fechaHasta: true,
  rol: {
    select: {
      nombre: true,
      estado: true,
      aplicacionId: true,
      aplicacion: { select: { estado: true } },
    },
  },
} as const;

/** Ídem `aplicacionesRootDe`, pero yendo a buscar las asignaciones a la base. */
export async function aplicacionesRootDeUsuario(usuarioId: number): Promise<number[]> {
  const asignaciones = await prisma.usuarioRol.findMany({
    where: { usuarioId },
    select: SELECT_ASIGNACIONES_ROL,
  });
  return aplicacionesRootDe(asignaciones);
}

// =====================================================================
// "No podés borrar el último administrador"
// =====================================================================
//
// Con root viviendo en `usuario_roles`, la misma pantalla que otorga root lo
// puede QUITAR — y `PUT /api/db/usuarios/:id/roles` borra todos los roles del
// usuario y recrea. Un admin que abre "Asignar roles" del último root y guarda
// deja la instalación sin nadie que pueda administrarla, y de ahí no se vuelve
// por la aplicación: el nivel ROOT del guard exige justamente lo que se acaba
// de borrar. Antes esto no podía pasar porque `es_root='S'` vivía en otra tabla
// y sobrevivía a cualquier edición de roles.
//
// Por eso las operaciones que pueden dejar el sistema sin root llaman a
// `usuariosRootDeSecapi` DESPUÉS de escribir, dentro de la transacción, y
// abortan si el resultado queda vacío. Se verifica el estado final real y no se
// intenta predecirlo a partir del payload: predecir obliga a reimplementar el
// criterio de vigencia y ahí es donde se cuelan los agujeros.

/**
 * Cliente de Prisma o cliente de transacción. Se tipa estructuralmente (y no
 * con `PrismaClient`) para que el mismo helper sirva adentro de un
 * `prisma.$transaction(async (tx) => ...)`, que es donde tiene que correr.
 */
type ClientePrismaRoles = Pick<typeof prisma, "rol" | "usuarioRol">;

/**
 * Ids de los usuarios ACTIVOS que ahora mismo son root de SecuritySuite.
 *
 * Mismo criterio que `aplicacionesRootDe` (nombre del rol, rol activo,
 * aplicación activa, asignación vigente) más una condición que allá no
 * corresponde: el usuario tiene que estar en `estado='A'`, porque
 * `resolveUsuario` no autentica a un usuario inactivo y un root dado de baja no
 * es un root que sirva para recuperar el sistema.
 *
 * El filtro por nombre se hace en JS con `esRolRoot` (trim + minúsculas) y no
 * en el `where`, por lo mismo que en `aplicacionesRootDe`: Postgres no va a
 * trimear por nosotros y no puede haber dos criterios distintos de "se llama
 * Root". Los roles de una aplicación son unas decenas de filas.
 */
export async function usuariosRootDeSecapi(
  cliente: ClientePrismaRoles = prisma,
  ahora: Date = new Date(),
): Promise<number[]> {
  const roles = await cliente.rol.findMany({
    where: { aplicacionId: aplicacionIdDeSecapi(), estado: "A", aplicacion: { estado: "A" } },
    select: { id: true, nombre: true },
  });
  const rolIds = roles.filter((r) => esRolRoot(r.nombre)).map((r) => r.id);
  if (rolIds.length === 0) return [];

  const filas = await cliente.usuarioRol.findMany({
    where: {
      rolId: { in: rolIds },
      usuario: { estado: "A" },
      OR: [{ fechaDesde: null }, { fechaDesde: { lte: ahora } }] as object[],
      AND: [{ OR: [{ fechaHasta: null }, { fechaHasta: { gte: ahora } }] }] as object[],
    },
    select: { usuarioId: true },
    distinct: ["usuarioId"],
  });
  return filas.map((f) => f.usuarioId);
}

/** Error de "esta operación dejaría al sistema sin root". Lo mapea el handler a un 409. */
export class SistemaSinRootError extends Error {
  constructor() {
    super(
      "La operación dejaría al sistema sin ningún usuario con el rol Root de SecuritySuite. " +
        "Asignale el rol Root a otro usuario ANTES de quitárselo a este.",
    );
    this.name = "SistemaSinRootError";
  }
}

/** Error de "te estás quitando tu propio root sin confirmarlo". Lo mapea el handler a un 409. */
export class AutoQuitarseRootError extends Error {
  constructor() {
    super(
      "Esta operación te quita a VOS el rol Root de SecuritySuite y perderías el acceso de " +
        "administración en el acto. Si es lo que querés, repetí la operación con " +
        "`confirmarQuitarmeRoot: true`.",
    );
    this.name = "AutoQuitarseRootError";
  }
}

/**
 * Red de contención común a toda escritura que puede tocar quién es root.
 * Se llama DENTRO de la transacción, después de escribir: si tira, la
 * transacción se deshace y no queda nada a medias.
 *
 * Dos reglas, y las dos son "no te pegues un tiro en el pie":
 *
 *   1. Tiene que quedar al menos UN usuario activo con el rol Root de secapi
 *      vigente. Es el clásico "no podés borrar el último administrador".
 *   2. Si el que llama se está sacando su PROPIO Root, se rechaza salvo que lo
 *      haya confirmado explícitamente. Se eligió pedir confirmación en vez de
 *      prohibirlo porque prohibirlo sería mentira: con dos roots, cualquiera de
 *      los dos puede quitarle el rol al otro igual, así que impedir solo el
 *      caso propio no agrega seguridad — agrega un camino que hay que hacer de
 *      a dos personas para nada. Lo que sí evita el accidente real es que el
 *      "guardar" del modal, que reemplaza TODOS los roles de una, no te deje
 *      afuera sin decir nada.
 */
export async function verificarQueQuedaRoot(
  cliente: ClientePrismaRoles,
  quienLlama: Pick<UsuarioAuth, "id" | "esRootDeSecapi">,
  confirmoQuitarseRoot: boolean,
): Promise<void> {
  const roots = await usuariosRootDeSecapi(cliente);
  if (roots.length === 0) throw new SistemaSinRootError();
  if (quienLlama.esRootDeSecapi && !roots.includes(quienLlama.id) && !confirmoQuitarseRoot) {
    throw new AutoQuitarseRootError();
  }
}

/**
 * Traduce a 409 los dos errores de `verificarQueQuedaRoot`, o devuelve null si
 * el error es otro. Va en el `catch` de todo handler que la llame, para que los
 * cinco endpoints que pueden dejar el sistema sin root contesten igual.
 *
 * 409 y no 400: el payload es válido, lo que no se puede es el ESTADO al que
 * llevaría. El mensaje del error se devuelve TAL CUAL —y no un texto genérico—
 * porque está escrito para que el que lo vea en el toast del panel sepa qué
 * hacer; el `codigo` va aparte para que el front pueda distinguirlos sin
 * parsear el texto.
 */
export function respuestaSiDejaSinRoot(error: unknown): NextResponse | null {
  if (error instanceof SistemaSinRootError || error instanceof AutoQuitarseRootError) {
    return NextResponse.json(
      { success: false, error: error.message, codigo: error.name },
      { status: 409 },
    );
  }
  return null;
}

/**
 * El usuario autenticado, con las DOS granularidades de root.
 *
 * Son dos porque describen cosas distintas, no porque una sea más ancha que la
 * otra: `esRootDeSecapi` es "¿es el superusuario del ecosistema?" (ver
 * `esRootDeAplicacion`) y `aplicacionesRoot` es el detalle de en qué
 * aplicaciones tiene el rol, que es el dato fino que necesita el que va a
 * mostrar o auditar algo.
 */
export interface UsuarioAuth {
  id: number;
  username: string;
  /**
   * Tiene el rol "Root" de la aplicación SecuritySuite (1). Es el superusuario
   * del ECOSISTEMA: habilita el nivel ROOT del guard de /api/db, el portal
   * /docs, las operaciones de administración del panel, y el bypass del motor
   * de permisos y del menú de CUALQUIER aplicación (ver `esRootDeAplicacion`).
   */
  esRootDeSecapi: boolean;
  /**
   * Aplicaciones donde el usuario tiene el rol "Root" vigente, tal cual está en
   * `usuario_roles`. Es el detalle por aplicación: sirve para auditar y para
   * que GOYA/TrackMovil/Granel decidan lo suyo, pero NO es la lista completa de
   * lo que el usuario puede abrir — el root de secapi abre todas sin estar en
   * esta lista.
   */
  aplicacionesRoot: number[];
}

/**
 * ¿Es root de ESA aplicación?
 *
 * Da true si el usuario tiene el rol "Root" de esa aplicación **o** el rol
 * "Root" de SecuritySuite.
 *
 * Lo segundo es una decisión de diseño del dueño, y hay que entenderla antes de
 * "corregirla": secapi es la herramienta DONDE SE CONFIGURA quién es root de
 * qué. Quien tiene el rol Root de secapi ya puede otorgarse el Root de GOYA,
 * de TrackMovil o de Granel con un par de clics; pretender que no es root de
 * esas aplicaciones no es una restricción real, es una restricción de mentira
 * que además obliga a que la persona que administra el sistema se ande
 * autoasignando roles para poder ver lo que ya puede ver. Así que el rol Root
 * de secapi ES el superusuario del ecosistema, igual que lo era `es_root='S'`,
 * con la diferencia de que ahora vive en una tabla que se audita y que se puede
 * dar y quitar por pantalla.
 *
 * Lo que NO se copia de `es_root='S'` es la parte mala: el privilegio ya no es
 * un flag suelto que cualquier UPDATE prende, y las operaciones que lo otorgan
 * (asignar roles, ABM de roles, accesos directos) están en nivel ROOT en
 * `POLITICAS` — antes estaban en AUTENTICADA, que es cualquiera de los 854.
 *
 * Fail-closed sin usuario o sin aplicación: `aplicacionId` 0 / null / undefined
 * da false SIEMPRE, incluso para el root de secapi. "No sé de qué aplicación me
 * estás hablando" no puede ser un permiso.
 */
export function esRootDeAplicacion(
  usuario: Pick<UsuarioAuth, "aplicacionesRoot"> | null | undefined,
  aplicacionId: number | null | undefined,
): boolean {
  if (!usuario || !aplicacionId) return false;
  if (usuario.aplicacionesRoot.includes(aplicacionIdDeSecapi())) return true;
  return usuario.aplicacionesRoot.includes(aplicacionId);
}

/**
 * Resuelve el usuario autenticado a partir del JWT (header o cookie).
 * Devuelve null si no hay token válido o el usuario no existe / inactivo.
 *
 * "Token válido" significa firma HS256 verificada contra JWT_SECRET y `exp`
 * vigente, con un secreto real (no el default del código). Fail-closed: si
 * JWT_SECRET no está bien configurada, esto devuelve null y NADIE se autentica
 * — preferible a que cualquiera se autentique como cualquiera.
 */
export async function resolveUsuario(
  req: NextRequest,
): Promise<UsuarioAuth | null> {
  const token = extractToken(req);
  if (!token) return null;

  const payload = verificarJwtConSecretoDelAmbiente(token);
  if (!payload) return null;

  const rawUsername = (payload.username ??
    payload.sub ??
    payload.name ??
    payload.email ??
    payload.preferred_username ??
    null) as string | null;

  if (!rawUsername) return null;

  const usuario = await prisma.usuario.findFirst({
    where: {
      OR: [
        { username: { equals: String(rawUsername).trim(), mode: "insensitive" } },
        { email: { equals: String(rawUsername).trim(), mode: "insensitive" } },
      ],
      estado: "A",
    },
    select: {
      id: true,
      username: true,
      // Las asignaciones de rol viajan con el usuario para que root se calcule
      // ACÁ, en el único cuello de botella que ya consumen el guard de /api/db,
      // el de /docs, el motor de permisos, el menú y los handlers de usuarios.
      // Cambiar el criterio en un solo lugar y que se propague solo es todo el
      // punto de resolverlo en `resolveUsuario` y no en cada consumidor.
      roles: { select: SELECT_ASIGNACIONES_ROL },
    },
  });

  if (!usuario) return null;

  const aplicacionesRoot = aplicacionesRootDe(usuario.roles);

  return {
    id: usuario.id,
    username: usuario.username,
    aplicacionesRoot,
    esRootDeSecapi: aplicacionesRoot.includes(aplicacionIdDeSecapi()),
  };
}

/**
 * Resuelve la aplicación a partir de un id (número) o un nombre (string).
 * Acepta el contrato PascalCase del check GeneXus (`AplicacionId`) y, por
 * tolerancia, el nombre. Default: NEXT_PUBLIC_APLICACION_ID / APLICACION_ID.
 *
 * AVISO sobre ese default, que es más peligroso de lo que parece: si el
 * llamador manda una aplicación que NO resuelve (nombre con un typo, id de una
 * app dada de baja), esto no devuelve null — cae al env, que en los tres
 * ambientes vale 1, y la pregunta termina evaluándose contra SecuritySuite en
 * silencio. O sea que `APP_NOT_FOUND` es prácticamente inalcanzable.
 *
 * No se corrige acá a propósito. Devolver null cuando el llamador SÍ especificó
 * una aplicación sería lo correcto, pero cambia el comportamiento de
 * `POST /api/db/permisos`, que es el gate de cada pantalla de Goya, TrackMovil
 * y el propio panel: si alguna de las tres viene mandando un nombre que no
 * matchea y hoy zafa porque cae en la 1, el día del deploy se van todos a
 * /no-autorizado. Se deja un `console.warn` para que el caso se pueda MEDIR en
 * los logs antes de tocarlo; con esa evidencia el cambio es de una línea.
 */
export async function resolveAplicacionId(
  aplicacionId?: number | string | null,
  aplicacionNombre?: string | null,
): Promise<number | null> {
  const idNum = Number(aplicacionId);
  if (Number.isFinite(idNum) && idNum > 0) {
    const app = await prisma.aplicacion.findFirst({
      where: { id: idNum, estado: "A" },
      select: { id: true },
    });
    if (app) return app.id;
  }

  if (aplicacionNombre) {
    const app = await prisma.aplicacion.findFirst({
      where: {
        nombre: { equals: String(aplicacionNombre).trim(), mode: "insensitive" },
        estado: "A",
      },
      select: { id: true },
    });
    if (app) return app.id;
  }

  const envId = Number(
    process.env.NEXT_PUBLIC_APLICACION_ID ?? process.env.APLICACION_ID ?? 0,
  );
  const resuelto = Number.isFinite(envId) && envId > 0 ? envId : null;

  // El llamador pidió una aplicación concreta y no existe (o está inactiva),
  // y sin embargo le vamos a contestar por otra. Se loguea para poder contar
  // cuántas veces pasa de verdad antes de decidir cortarlo (ver el comentario
  // de arriba).
  if ((aplicacionId != null || aplicacionNombre) && resuelto !== null) {
    console.warn(
      `[permisos] la aplicación pedida (id=${String(aplicacionId)} nombre=${String(aplicacionNombre)}) ` +
        `no resolvió a ninguna fila activa de \`aplicaciones\`: se cae al default del ambiente (${resuelto}). ` +
        "La respuesta va a ser la de OTRA aplicación.",
    );
  }

  return resuelto;
}

/**
 * ¿El usuario puede aprobar/rechazar solicitudes?
 * Root siempre; en otro caso debe tener acceso (directo grant vigente o vía
 * rol) a alguna funcionalidad vinculada al objeto `solicitudes` + acción
 * `approve`.
 *
 * "Root" acá es el de SecuritySuite y no el de la aplicación que se está
 * solicitando: aprobar accesos es una operación de administración de la
 * herramienta de seguridad (la funcionalidad `solicitudes` se sembró en la
 * aplicación 1), no del sistema al que pertenece el permiso pedido.
 */
export async function usuarioPuedeAprobar(
  usuario: Pick<UsuarioAuth, "id" | "esRootDeSecapi">,
): Promise<boolean> {
  if (usuario.esRootDeSecapi) return true;

  const objeto = await prisma.objeto.findFirst({
    where: { key: APROBADOR_OBJETO_KEY, estado: "A" },
    select: { id: true },
  });
  if (!objeto) return false;

  const accion = await prisma.objetoAccion.findFirst({
    where: {
      objetoId: objeto.id,
      key: { equals: APROBADOR_ACCION_KEY, mode: "insensitive" },
    },
    select: { id: true },
  });

  const funcLinks = await prisma.funcionalidadObjetoAccion.findMany({
    where: {
      objetoId: objeto.id,
      ...(accion ? { objetoAccionId: accion.id } : {}),
      funcionalidad: { estado: "A" },
    },
    select: { funcionalidadId: true },
  });
  const funcIds = [...new Set(funcLinks.map((f) => f.funcionalidadId))];
  if (funcIds.length === 0) return false;

  const now = new Date();

  const accesoDirecto = await prisma.acceso.findFirst({
    where: {
      usuarioId: usuario.id,
      funcionalidadId: { in: funcIds },
      efecto: { in: EFECTOS_ALLOW },
      OR: [{ fechaDesde: null }, { fechaDesde: { lte: now } }] as object[],
      AND: [{ OR: [{ fechaHasta: null }, { fechaHasta: { gte: now } }] }] as object[],
    },
    select: { funcionalidadId: true },
  });
  if (accesoDirecto) return true;

  const rolesActivos = await prisma.usuarioRol.findMany({
    where: {
      usuarioId: usuario.id,
      OR: [{ fechaDesde: null }, { fechaDesde: { lte: now } }] as object[],
      AND: [{ OR: [{ fechaHasta: null }, { fechaHasta: { gte: now } }] }] as object[],
      rol: { estado: "A" },
    },
    select: { rolId: true },
  });
  const rolIds = rolesActivos.map((r) => r.rolId);
  if (rolIds.length === 0) return false;

  const rolFunc = await prisma.rolFuncionalidad.findFirst({
    where: { rolId: { in: rolIds }, funcionalidadId: { in: funcIds } },
    select: { funcionalidadId: true },
  });
  return Boolean(rolFunc);
}
