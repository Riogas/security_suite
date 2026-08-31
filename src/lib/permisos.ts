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

// Las keys viven en un módulo SIN dependencias (`permisosKeys.ts`) y se
// reexportan acá para no cambiarle el import a nadie: este archivo arrastra
// Prisma y `next/server`, y los hooks "use client" del panel necesitan las
// mismas constantes sin llevarse el cliente de Prisma al navegador.
export {
  ACCION_VIEW,
  APROBADOR_ACCION_KEY,
  APROBADOR_OBJETO_KEY,
} from "@/lib/permisosKeys";
import {
  ACCION_VIEW as _ACCION_VIEW,
  APROBADOR_ACCION_KEY as _APROBADOR_ACCION_KEY,
  APROBADOR_OBJETO_KEY as _APROBADOR_OBJETO_KEY,
} from "@/lib/permisosKeys";

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
  return (
    String(nombre ?? "")
      .trim()
      .toLowerCase() === NOMBRE_ROL_ROOT
  );
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
  const n = Number(
    process.env.NEXT_PUBLIC_APLICACION_ID ?? process.env.APLICACION_ID ?? 1,
  );
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
  if (asignacion.fechaDesde && asignacion.fechaDesde.getTime() > t)
    return false;
  if (asignacion.fechaHasta && asignacion.fechaHasta.getTime() < t)
    return false;
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
    if (
      String(a.rol?.estado ?? "")
        .trim()
        .toUpperCase() !== "A"
    )
      continue;
    if (
      String(a.rol?.aplicacion?.estado ?? "")
        .trim()
        .toUpperCase() !== "A"
    )
      continue;
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
export async function aplicacionesRootDeUsuario(
  usuarioId: number,
): Promise<number[]> {
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
    where: {
      aplicacionId: aplicacionIdDeSecapi(),
      estado: "A",
      aplicacion: { estado: "A" },
    },
    select: { id: true, nombre: true },
  });
  const rolIds = roles.filter((r) => esRolRoot(r.nombre)).map((r) => r.id);
  if (rolIds.length === 0) return [];

  const filas = await cliente.usuarioRol.findMany({
    where: {
      rolId: { in: rolIds },
      usuario: { estado: "A" },
      OR: [{ fechaDesde: null }, { fechaDesde: { lte: ahora } }] as object[],
      AND: [
        { OR: [{ fechaHasta: null }, { fechaHasta: { gte: ahora } }] },
      ] as object[],
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
  if (
    quienLlama.esRootDeSecapi &&
    !roots.includes(quienLlama.id) &&
    !confirmoQuitarseRoot
  ) {
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
  if (
    error instanceof SistemaSinRootError ||
    error instanceof AutoQuitarseRootError
  ) {
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

// =====================================================================
// Identidad no ambigua
// =====================================================================
//
// El token trae UN string (`username`, o `sub`, o `email`…) y hay que
// convertirlo en UNA fila de `usuarios`. La búsqueda es
// `OR: [username ci, email ci]`, y ahí está el problema: los unique de
// `username` y de `email` son INDEPENDIENTES, así que nada impide que el
// username de una fila sea igual al email de otra. Con el `findFirst` sin
// `orderBy` que había acá, esa búsqueda matcheaba DOS filas y Postgres devolvía
// la que se le antojara (el plan puede cambiar con un ANALYZE o con el tamaño
// de la tabla). El ataque concreto: doy de alta un usuario cuyo `username` sea
// el EMAIL de dmedaglia, y a partir de ahí el token de dmedaglia resuelve a
// veces a mi fila y a veces a la suya.
//
// Y no hace falta el cruce username↔email: el unique de `username` es
// case-SENSITIVE en Postgres, pero la búsqueda es `mode: "insensitive"`. O sea
// que 'Juan' y 'juan' son dos filas legales que la misma búsqueda matchea.
//
// La decisión, en dos reglas y en este orden:
//
//   1. Si UNA sola de las filas matchea por `username`, esa es la identidad.
//      El username es la identidad primaria (es lo que el login pide y lo que
//      el token dice); que además coincida con el email de otro no la vuelve
//      dudosa. Esto deja el camino feliz —el 100% de los usuarios de hoy—
//      exactamente igual que antes.
//   2. En cualquier otro caso con más de un candidato: RECHAZAR. Una identidad
//      ambigua no es una identidad, y "elegir alguna" es elegir mal la mitad de
//      las veces. Se loguea con nivel de ERROR porque si esto pasa es un ataque
//      o una corrupción de datos, no un caso de uso.
//
// Medido contra la base productiva en agosto de 2026: CERO colisiones (ningún
// username igual al email de otra fila, ningún par de usernames que difiera
// solo en mayúsculas). O sea que hoy esto es un no-op y no puede sacar del
// sistema a nadie. La otra mitad del arreglo —que la colisión no se pueda
// CREAR— está en `buscarColisionesDeIdentidad`, más abajo.

/** Lo mínimo para decidir una identidad. Lo cumplen las filas de `usuarios`. */
export interface FilaIdentidad {
  id: number;
  username: string;
  email: string | null;
}

/** Comparación de identidades: sin espacios en los bordes y sin mayúsculas. */
export function normalizarIdentidad(valor: string | null | undefined): string {
  return String(valor ?? "")
    .trim()
    .toLowerCase();
}

export type ResolucionIdentidad<T> =
  | { ok: true; usuario: T }
  | {
      ok: false;
      motivo: "SIN_COINCIDENCIA" | "IDENTIDAD_AMBIGUA";
      candidatos: number[];
    };

/**
 * Elige UNA fila entre las que matchearon, o rechaza. Función pura: es el
 * corazón del arreglo y por eso se testea sola, sin base de por medio
 * (`scripts/test-identidad.ts`).
 */
export function elegirIdentidad<T extends FilaIdentidad>(
  candidatos: readonly T[],
  sujeto: string,
): ResolucionIdentidad<T> {
  if (candidatos.length === 0)
    return { ok: false, motivo: "SIN_COINCIDENCIA", candidatos: [] };

  const buscado = normalizarIdentidad(sujeto);
  const porUsername = candidatos.filter(
    (c) => normalizarIdentidad(c.username) === buscado,
  );

  // Regla 1: el username manda, si es uno solo.
  if (porUsername.length === 1) return { ok: true, usuario: porUsername[0] };
  // Dos usernames que difieren solo en mayúsculas: no hay forma de elegir.
  if (porUsername.length > 1) {
    return {
      ok: false,
      motivo: "IDENTIDAD_AMBIGUA",
      candidatos: porUsername.map((c) => c.id),
    };
  }

  // Regla 2: sin match por username, solo vale si hay exactamente un candidato.
  if (candidatos.length === 1) return { ok: true, usuario: candidatos[0] };
  return {
    ok: false,
    motivo: "IDENTIDAD_AMBIGUA",
    candidatos: candidatos.map((c) => c.id),
  };
}

/**
 * ¿Alguna de estas filas choca con los valores que se quieren guardar?
 *
 * "Chocar" es que el `username` o el `email` nuevos sean iguales —comparando
 * sin mayúsculas y sin espacios en los bordes— al `username` o al `email` de
 * otra fila. Los dos sentidos cuentan, y el cruce también: un username que es
 * el email de otro es exactamente la colisión que rompe `elegirIdentidad`.
 *
 * Pura, para poder testearla sin base. El que la llama ya sacó de la lista la
 * fila que está editando.
 */
export function colisionesDeIdentidad<T extends FilaIdentidad>(
  filas: readonly T[],
  valores: { username?: string | null; email?: string | null },
): T[] {
  const nuevos = [valores.username, valores.email]
    .map(normalizarIdentidad)
    .filter((v) => v.length > 0);
  if (nuevos.length === 0) return [];

  return filas.filter((f) => {
    const suyos = [
      normalizarIdentidad(f.username),
      normalizarIdentidad(f.email),
    ].filter(Boolean);
    return suyos.some((s) => nuevos.includes(s));
  });
}

/** Cliente de Prisma (o de transacción) con lo justo para consultar `usuarios`. */
type ClientePrismaUsuarios = Pick<typeof prisma, "usuario">;

/**
 * Ídem `colisionesDeIdentidad` pero yendo a buscar los candidatos a la base.
 * La usan el alta y la edición de usuarios: sin esto, el arreglo de
 * `resolveUsuario` solo tapa las colisiones que YA existen (ninguna) y deja
 * crear las próximas.
 *
 * Limitación conocida: el `equals … insensitive` compara contra el valor tal
 * cual está guardado, así que un `username` almacenado con espacios en los
 * bordes no se detecta. Trimear del lado del servidor pediría SQL crudo, y un
 * valor así ya es un dato corrupto por su cuenta.
 */
export async function buscarColisionesDeIdentidad(
  cliente: ClientePrismaUsuarios,
  datos: {
    username?: string | null;
    email?: string | null;
    excluirUsuarioId?: number | null;
  },
): Promise<FilaIdentidad[]> {
  const valores = [datos.username, datos.email]
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0);
  if (valores.length === 0) return [];

  const condiciones = valores.flatMap((v) => [
    { username: { equals: v, mode: "insensitive" as const } },
    { email: { equals: v, mode: "insensitive" as const } },
  ]);

  const filas = await cliente.usuario.findMany({
    where: {
      OR: condiciones,
      ...(datos.excluirUsuarioId
        ? { NOT: { id: datos.excluirUsuarioId } }
        : {}),
    },
    select: { id: true, username: true, email: true },
    orderBy: { id: "asc" },
    take: 20,
  });

  // Se vuelve a filtrar con el criterio puro: uno solo manda, y es el que se
  // testea. El `where` es nada más el prefiltro que evita traer la tabla.
  return colisionesDeIdentidad(filas, datos);
}

/** Mensaje único para el 400 del alta y el de la edición. */
export function mensajeDeColisionDeIdentidad(
  colisiones: readonly FilaIdentidad[],
): string {
  const quienes = colisiones.map((c) => `#${c.id} ${c.username}`).join(", ");
  return (
    "El usuario o el email ya están usados por otro usuario (" +
    quienes +
    "). El username y el email tienen que ser únicos ENTRE SÍ y sin distinguir " +
    "mayúsculas: si el username de uno es el email de otro, el token deja de " +
    "identificar a una sola persona."
  );
}

/**
 * Resuelve el usuario autenticado a partir del JWT (header o cookie).
 * Devuelve null si no hay token válido o el usuario no existe / inactivo.
 *
 * "Token válido" significa firma HS256 verificada contra JWT_SECRET y `exp`
 * vigente, con un secreto real (no el default del código). Fail-closed: si
 * JWT_SECRET no está bien configurada, esto devuelve null y NADIE se autentica
 * — preferible a que cualquiera se autentique como cualquiera.
 *
 * Y fail-closed también con la IDENTIDAD: si el sujeto del token matchea más de
 * una fila y no hay forma de elegir, devuelve null. Ver el bloque "Identidad no
 * ambigua" de más arriba.
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

  const sujeto = String(rawUsername).trim();

  // `findMany` y no `findFirst`: hay que VER si matchea más de una fila para
  // poder rechazar. `take` acota el peor caso (un email repetido en N filas no
  // puede pasar por el unique, pero el prefiltro no lo sabe).
  const candidatos = await prisma.usuario.findMany({
    where: {
      OR: [
        { username: { equals: sujeto, mode: "insensitive" } },
        { email: { equals: sujeto, mode: "insensitive" } },
      ],
      estado: "A",
    },
    orderBy: { id: "asc" },
    take: 5,
    select: {
      id: true,
      username: true,
      email: true,
      // Las asignaciones de rol viajan con el usuario para que root se calcule
      // ACÁ, en el único cuello de botella que ya consumen el guard de /api/db,
      // el de /docs, el motor de permisos, el menú y los handlers de usuarios.
      // Cambiar el criterio en un solo lugar y que se propague solo es todo el
      // punto de resolverlo en `resolveUsuario` y no en cada consumidor.
      roles: { select: SELECT_ASIGNACIONES_ROL },
    },
  });

  const resolucion = elegirIdentidad(candidatos, sujeto);
  if (!resolucion.ok) {
    if (resolucion.motivo === "IDENTIDAD_AMBIGUA") {
      // Nivel ERROR y no warn: esto no pasa en una instalación sana. O alguien
      // dio de alta una colisión a propósito (`buscarColisionesDeIdentidad` es
      // lo que tendría que haberlo impedido), o los datos se corrompieron.
      console.error(
        `[permisos] el sujeto del token ("${sujeto}") matchea ${resolucion.candidatos.length} ` +
          `usuarios activos (ids ${resolucion.candidatos.join(", ")}). Se rechaza la ` +
          "autenticación: una identidad ambigua no es una identidad.",
      );
    }
    return null;
  }

  const usuario = resolucion.usuario;
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
        nombre: {
          equals: String(aplicacionNombre).trim(),
          mode: "insensitive",
        },
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

// =====================================================================
// El motor de permisos aplicado a SECAPI MISMA
// =====================================================================
//
// El pedido del dueño, textual: "hacer que secapi consulte su propio motor de
// permisos para autorizarse a sí mismo". Hasta acá el motor existía y lo
// consumían Goya y TrackMovil por `POST /api/db/permisos`, pero secapi no lo
// usaba para sus propios endpoints: estaban en AUTENTICADA (alcanza con tener
// sesión de cualquiera de las cuatro aplicaciones) o en ROOT (binario).
//
// Lo que sigue NO es un motor nuevo. Es la GENERALIZACIÓN de lo que
// `usuarioPuedeAprobar` ya hacía desde el día uno para una sola pregunta
// ("¿podés aprobar solicitudes?"), convertida en "¿tenés otorgado (objeto,
// acción)?" para cualquier par. `usuarioPuedeAprobar` pasó a ser una línea
// sobre esto, así que no hay dos criterios que se puedan desincronizar.
//
// ── Por qué un puerto y no el cliente de Prisma pelado ──────────────────────
//
// Las dos preguntas de abajo (`funcionalidadesQueProtegen` y
// `funcionalidadesDelUsuario`) son la superficie entera del motor. Aislarlas en
// una interfaz deja la DECISIÓN —que es la parte con la que uno se equivoca—
// en una función pura de tres líneas que se testea sin base, y a la vez deja la
// implementación real en un solo lugar. Es el mismo recurso que ya usa
// `crearGuardApi` con `resolveUsuario`.
//
// ── Dos diferencias deliberadas con `POST /api/db/permisos` ─────────────────
//
//   1. NO se honra `es_publico` (ni el del objeto ni el de la funcionalidad).
//      En el motor de pantallas, `es_publico='S'` significa "esta pantalla la
//      ve todo el mundo", y está bien para una pantalla. Acá abre endpoints que
//      administran quién tiene qué —`DELETE /usuarios/:id`,
//      `POST /usuarios/importar`—, y un objeto marcado público por cualquier
//      motivo no puede reabrirlos en silencio. Administrar se OTORGA; no se
//      hereda de un flag pensado para otra cosa.
//   2. La acción tiene que EXISTIR. El `usuarioPuedeAprobar` viejo, si no
//      encontraba la `objeto_accion`, dejaba de filtrar por acción y aceptaba
//      cualquier funcionalidad colgada del objeto. Eso es fail-open y acá se
//      corta: sin la acción, no hay permiso.
//
// Lo que sí se copia igual: `solo_root='S'` no lo otorga nadie que no sea root,
// y la vigencia de la funcionalidad y de la asignación de rol se miran con el
// mismo criterio `desde <= ahora <= hasta` que usa el resto del repo.

/** Las dos únicas preguntas que el motor le hace a la base. */
export interface MotorDeFuncionalidades {
  /**
   * Ids de las funcionalidades ACTIVAS, VIGENTES y no-`solo_root` que protegen
   * (objetoKey, accionKey) dentro de la aplicación SecuritySuite. Vacío
   * significa "nadie que no sea root puede": el objeto no existe, la acción no
   * existe, o no hay ninguna funcionalidad colgada.
   */
  funcionalidadesQueProtegen(
    objetoKey: string,
    accionKey: string,
  ): Promise<number[]>;
  /**
   * Ids de las funcionalidades que el usuario tiene otorgadas AHORA, sea por
   * acceso directo (`accesos` con efecto grant y vigente) o por rol activo y
   * vigente. Son las dos vías del modelo y las dos cuentan igual.
   */
  funcionalidadesDelUsuario(usuarioId: number): Promise<number[]>;
  /**
   * Qué (objeto, acción) de SecuritySuite abren estas funcionalidades. Es la
   * pregunta inversa de `funcionalidadesQueProtegen` y la usa `/usuarios/yo`
   * para decirle a la UI qué botones puede prender.
   */
  objetosDeFuncionalidades(
    funcionalidadIds: readonly number[],
  ): Promise<Array<{ objetoKey: string; accionKey: string }>>;
}

/** Filtro de vigencia `desde <= ahora <= hasta`, con las dos fechas nullable. */
function whereVigente(ahora: Date) {
  return {
    OR: [{ fechaDesde: null }, { fechaDesde: { lte: ahora } }] as object[],
    AND: [
      { OR: [{ fechaHasta: null }, { fechaHasta: { gte: ahora } }] },
    ] as object[],
  };
}

/**
 * Cliente de Prisma con lo justo para el motor. Se tipa estructuralmente, igual
 * que `ClientePrismaRoles`, para que `scripts/test-motor-secapi.ts` pueda pasar
 * una base en memoria y ejercitar las dos vías de otorgamiento (rol y acceso
 * directo) sin Postgres de por medio.
 */
export type ClientePrismaMotor = Pick<
  typeof prisma,
  | "objeto"
  | "objetoAccion"
  | "funcionalidadObjetoAccion"
  | "acceso"
  | "usuarioRol"
  | "rolFuncionalidad"
>;

/** El motor real, contra Postgres (o contra lo que se le pase). */
export function crearMotorPrisma(
  cliente: ClientePrismaMotor,
): MotorDeFuncionalidades {
  return {
    async funcionalidadesQueProtegen(objetoKey, accionKey) {
      const appId = aplicacionIdDeSecapi();
      const ahora = new Date();

      // `orderBy` explícito en los dos `findFirst`: sin él, dos filas con la
      // misma key devuelven cualquiera de las dos, que es el mismo defecto que se
      // acaba de arreglar en `resolveUsuario`.
      const objeto = await cliente.objeto.findFirst({
        where: { aplicacionId: appId, key: objetoKey, estado: "A" },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      if (!objeto) return [];

      const accion = await cliente.objetoAccion.findFirst({
        where: {
          objetoId: objeto.id,
          key: { equals: accionKey, mode: "insensitive" },
        },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      if (!accion) return [];

      // `objetoAccionId` exacto, sin aceptar los vínculos con `objetoAccionId`
      // null. Un vínculo null es "el objeto entero" y es más ancho que lo que se
      // está preguntando; el andamiaje sembrado usa siempre el vínculo exacto.
      const links = await cliente.funcionalidadObjetoAccion.findMany({
        where: {
          objetoId: objeto.id,
          objetoAccionId: accion.id,
          funcionalidad: {
            aplicacionId: appId,
            estado: "A",
            ...whereVigente(ahora),
          },
        },
        select: {
          funcionalidadId: true,
          funcionalidad: { select: { soloRoot: true } },
        },
      });

      // `solo_root` se filtra en JS y no en el `where` por lo mismo que el nombre
      // del rol Root: la columna es Char(1) y hay que compararla con trim y sin
      // mayúsculas, cosa que Postgres no va a hacer solo.
      return [
        ...new Set(
          links
            .filter(
              (l) =>
                String(l.funcionalidad.soloRoot ?? "")
                  .trim()
                  .toUpperCase() !== "S",
            )
            .map((l) => l.funcionalidadId),
        ),
      ];
    },

    async funcionalidadesDelUsuario(usuarioId) {
      const ahora = new Date();

      const [accesos, asignaciones] = await Promise.all([
        cliente.acceso.findMany({
          where: {
            usuarioId,
            efecto: { in: EFECTOS_ALLOW },
            ...whereVigente(ahora),
          },
          select: { funcionalidadId: true },
        }),
        cliente.usuarioRol.findMany({
          where: { usuarioId, rol: { estado: "A" }, ...whereVigente(ahora) },
          select: { rolId: true },
        }),
      ]);

      const rolIds = [...new Set(asignaciones.map((a) => a.rolId))];
      const porRol = rolIds.length
        ? await cliente.rolFuncionalidad.findMany({
            where: { rolId: { in: rolIds } },
            select: { funcionalidadId: true },
          })
        : [];

      return [
        ...new Set([
          ...accesos.map((a) => a.funcionalidadId),
          ...porRol.map((r) => r.funcionalidadId),
        ]),
      ];
    },

    async objetosDeFuncionalidades(funcionalidadIds) {
      if (funcionalidadIds.length === 0) return [];
      const appId = aplicacionIdDeSecapi();
      const ahora = new Date();

      const links = await cliente.funcionalidadObjetoAccion.findMany({
        where: {
          funcionalidadId: { in: [...funcionalidadIds] },
          objeto: { aplicacionId: appId, estado: "A" },
          funcionalidad: { aplicacionId: appId, estado: "A", ...whereVigente(ahora) },
        },
        select: {
          objeto: { select: { key: true } },
          objetoAccion: { select: { key: true } },
          funcionalidad: { select: { soloRoot: true } },
        },
      });

      return links
        .filter((l) => String(l.funcionalidad.soloRoot ?? "").trim().toUpperCase() !== "S")
        // Sin acción no hay nada que informar: el guard exige la acción exacta.
        .filter((l) => Boolean(l.objetoAccion?.key) && Boolean(l.objeto?.key))
        .map((l) => ({
          objetoKey: String(l.objeto.key).trim(),
          accionKey: String(l.objetoAccion!.key).trim().toLowerCase(),
        }))
        .filter((l) => l.objetoKey.length > 0 && l.accionKey.length > 0);
    },
  };
}

/** La instancia que usa la aplicación. */
export const motorPrisma: MotorDeFuncionalidades = crearMotorPrisma(prisma);

/**
 * ¿El usuario tiene otorgado (objetoKey, accionKey) en SecuritySuite?
 *
 * Root pasa siempre y sin tocar la base: es el corte del dueño ("root accede a
 * todo secapi"), y además es lo que evita que una instalación recién levantada
 * —sin funcionalidades sembradas— se quede sin nadie que la pueda administrar.
 *
 * Todo lo demás es fail-closed: sin objeto, sin acción, sin funcionalidad
 * activa o sin otorgamiento, es `false`. Los errores de base NO se atrapan acá
 * a propósito: los atrapa el que llama (el guard los convierte en 503), porque
 * "no pude preguntar" y "preguntamos y no tenés" son dos cosas distintas y solo
 * una de las dos merece que la persona vuelva a intentar.
 */
export async function usuarioTieneFuncionalidad(
  usuario: Pick<UsuarioAuth, "id" | "esRootDeSecapi">,
  objetoKey: string,
  accionKey: string,
  motor: MotorDeFuncionalidades = motorPrisma,
): Promise<boolean> {
  if (usuario.esRootDeSecapi) return true;
  if (!objetoKey?.trim() || !accionKey?.trim()) return false;

  const protegen = await motor.funcionalidadesQueProtegen(
    objetoKey.trim(),
    accionKey.trim(),
  );
  if (protegen.length === 0) return false;

  const tiene = await motor.funcionalidadesDelUsuario(usuario.id);
  if (tiene.length === 0) return false;

  const otorgadas = new Set(tiene);
  return protegen.some((f) => otorgadas.has(f));
}

/**
 * ¿El usuario puede aprobar/rechazar solicitudes?
 *
 * Root siempre; en otro caso tiene que tener otorgada (por rol o por acceso
 * directo) alguna funcionalidad vinculada al objeto `solicitudes` + acción
 * `approve`. Es exactamente la misma pregunta que hace el nivel ADMIN del
 * guard para cualquier otra pantalla, y por eso ahora es una línea: si el
 * criterio cambia, cambia para las dos.
 *
 * "Root" acá es el de SecuritySuite y no el de la aplicación que se está
 * solicitando: aprobar accesos es una operación de administración de la
 * herramienta de seguridad (la funcionalidad `solicitudes` se sembró en la
 * aplicación 1), no del sistema al que pertenece el permiso pedido.
 */
export async function usuarioPuedeAprobar(
  usuario: Pick<UsuarioAuth, "id" | "esRootDeSecapi">,
  motor: MotorDeFuncionalidades = motorPrisma,
): Promise<boolean> {
  return usuarioTieneFuncionalidad(
    usuario,
    _APROBADOR_OBJETO_KEY,
    _APROBADOR_ACCION_KEY,
    motor,
  );
}

/**
 * Qué objetos de SecuritySuite tiene habilitados el usuario, y con qué
 * acciones: `{ usuarios: ["view"], roles: ["view"] }`.
 *
 * Lo consume `GET /api/db/usuarios/yo` para que la UI pueda apagar los botones
 * que el servidor va a rechazar. Es información sobre UNO MISMO, pero igual va
 * acotada: solo la aplicación SecuritySuite, solo las keys, y nada de ids,
 * nombres de funcionalidades ni de roles. Para un root devuelve `{}` — root no
 * necesita la lista, pasa por otro lado, y volcarle el modelo entero al
 * navegador no le sirve a nadie.
 */
export async function objetosAdministrablesDe(
  usuario: Pick<UsuarioAuth, "id" | "esRootDeSecapi">,
  motor: MotorDeFuncionalidades = motorPrisma,
): Promise<Record<string, string[]>> {
  if (usuario.esRootDeSecapi) return {};

  const funcIds = await motor.funcionalidadesDelUsuario(usuario.id);
  if (funcIds.length === 0) return {};

  const mapa: Record<string, Set<string>> = {};
  for (const { objetoKey, accionKey } of await motor.objetosDeFuncionalidades(funcIds)) {
    (mapa[objetoKey] ??= new Set()).add(accionKey);
  }

  return Object.fromEntries(
    Object.entries(mapa)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, [...v].sort()]),
  );
}

// =====================================================================
// Qué NO se puede otorgar aprobando una solicitud
// =====================================================================
//
// `POST /solicitudes/:id/aprobar` escribe en `accesos`, que es una de las tres
// puertas a las concesiones directas de funcionalidad. Las otras dos
// (`PUT /usuarios/:id/accesos` y `POST|DELETE /accesos`) son de nivel ROOT; esta
// no puede serlo, porque el flujo de aprobación existe justamente para que un
// aprobador que NO es root apruebe.
//
// Entonces se acota QUÉ se puede otorgar por esta vía. La regla se define por
// objeto/funcionalidad y no por ids mágicos, para que siga valiendo en otra
// base y para que no haya que acordarse de actualizarla:
//
//   - `solo_root='S'`: la funcionalidad ya dice de quién es.
//   - La funcionalidad es DE SecuritySuite, o está colgada de un objeto de
//     SecuritySuite. Toda funcionalidad de secapi es administrativa: es la
//     herramienta donde se configura quién tiene qué. Los dos casos que el
//     dueño nombró caen acá por construcción — la funcionalidad `Solicitudes`
//     (aprobarme a mí mismo la de aprobar fabrica más aprobadores, en cadena) y
//     la de `docs` (el catálogo entero de las APIs del ecosistema)— y también
//     las nueve pantallas del panel que el nivel ADMIN gatea.
//
// Lo que esto NO toca: las solicitudes de Goya, TrackMovil y Granel, que son el
// 100% del uso real del flujo. Sus funcionalidades son de las aplicaciones 3, 5
// y 6 y se siguen aprobando igual.

/**
 * ¿Otorgar esta funcionalidad es otorgar administración de secapi?
 *
 * Fail-closed: si la funcionalidad no se puede leer, contesta `true`. "No sé
 * qué es esto" no puede ser una razón para otorgarlo.
 */
export async function funcionalidadConfierePrivilegio(
  funcionalidadId: number,
): Promise<boolean> {
  const appId = aplicacionIdDeSecapi();
  const funcionalidad = await prisma.funcionalidad.findUnique({
    where: { id: funcionalidadId },
    select: {
      aplicacionId: true,
      soloRoot: true,
      objetoAcciones: {
        select: { objeto: { select: { aplicacionId: true } } },
      },
    },
  });
  if (!funcionalidad) return true;

  if (
    String(funcionalidad.soloRoot ?? "")
      .trim()
      .toUpperCase() === "S"
  )
    return true;
  if (funcionalidad.aplicacionId === appId) return true;
  return funcionalidad.objetoAcciones.some(
    (l) => l.objeto?.aplicacionId === appId,
  );
}
