import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { extractToken, resolveUsuario, type UsuarioAuth } from "@/lib/permisos";
import { leerSecretoJwt, verificarJwt } from "@/lib/auth/verificarJwt";
import { patternToRegex, specificity } from "@/lib/routePattern";

// =====================================================================
// Guard de /api/db/*
//
// Antes de esto, de las 64 operaciones bajo /api/db/ solo 10 miraban algo, y
// las 10 lo miraban mal (`decodeJwt` era base64 puro). Quedaban 54 abiertas al
// que llegara al puerto, 30 de ellas de ESCRITURA: crear usuarios, asignar
// roles, borrar aplicaciones.
//
// ── Por qué un helper por ruta y no un middleware ─────────────────────────
// La tentación es meter esto en `src/proxy.ts` (el "middleware" de Next 16) y
// listo. No sirve, por tres motivos concretos de ESTE repo:
//
//   1. `src/proxy.ts` corre en el runtime Edge: no hay `jsonwebtoken` (usa el
//      crypto de Node) ni Prisma. Verificar la firma habría obligado a
//      reimplementar HS256 con WebCrypto — un SEGUNDO criterio de verificación,
//      distinto del de /docs, que es exactamente el problema que se viene a
//      resolver — y resolver el usuario contra Postgres no se puede hacer ahí.
//   2. `src/proxy.ts` hoy FALLA ABIERTO a propósito: su catch devuelve
//      `NextResponse.next()`, y todo su guard está detrás del flag
//      `PERMISOS_ENFORCE`, que en varios ambientes está apagado. Colgar la
//      autenticación de la API de un flag pensado para el rollout del guard de
//      pantallas es pedir que alguien la apague sin darse cuenta.
//   3. La política no es uniforme: `/login` tiene que seguir público, cuatro
//      endpoints los llama el edge de Granel sin usuario (api-key de servicio) y
//      dos exigen root. Eso se declara mejor en una tabla que en un middleware
//      lleno de ifs.
//
// El costo conocido de esta decisión es que una ruta NUEVA nace abierta si nadie
// llama al guard. Por eso `scripts/test-api-guard.ts` recorre
// `src/app/api/db/**/route.ts` y falla si aparece un handler que no invoca
// `requireApiAuth`, o un path sin política declarada acá. La red de contención
// no es la disciplina: es el test.
// =====================================================================

export type NivelAcceso =
  /** Sin credencial. Solo el login: es la puerta de entrada de las 4 apps. */
  | "PUBLICA"
  /** Api-key de servicio (`x-api-key`) O usuario autenticado. */
  | "SERVICIO"
  /** JWT verificado + usuario activo en Postgres. */
  | "AUTENTICADA"
  /**
   * Lo anterior + el ROL "Root" de la aplicación SecuritySuite, vigente y
   * activo (`UsuarioAuth.esRootDeSecapi`). Antes era `usuarios.es_root='S'`:
   * un flag global que en producción tenía UN solo usuario de 854, mientras
   * que el rol lo tenía la gente que realmente administra el sistema. Ver el
   * bloque "Root por ROL" en src/lib/permisos.ts.
   *
   * En producción (agosto 2026) son DOS personas: dmedaglia y jgomez. Poner una
   * ruta en este nivel significa literalmente "esto lo pueden hacer ellos dos".
   */
  | "ROOT";

type Metodo = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface Politica {
  /** Patrón relativo a `/api/db`, con `:param` por segmento dinámico. */
  patron: string;
  metodos: Metodo[];
  nivel: NivelAcceso;
  /** Por qué está en ese nivel. Lo lee el que venga a cambiarlo. */
  motivo: string;
}

/** Prefijo que cubre este guard. Todo lo de acá abajo necesita una política. */
export const PREFIJO_API_DB = "/api/db";

// ─── Tabla de políticas ─────────────────────────────────────────────────────
//
// Fuente única de verdad. Lo que no está declarado acá se DENIEGA (ver
// `nivelDeRuta`), así que agregar una ruta sin pensar la política no la deja
// abierta: la deja rota, que es el error correcto.
export const POLITICAS: readonly Politica[] = [
  // ── Público ───────────────────────────────────────────────────────────────
  {
    patron: "/login",
    metodos: ["POST"],
    nivel: "PUBLICA",
    motivo:
      "Único endpoint que NO puede pedir credencial: es el login de secapi, Goya, TrackMovil y el edge de Granel. No hay otro público en toda la app (no existe recuperación de clave ni registro).",
  },

  // ── Servicio: lo que el edge de Granel llama sin usuario ───────────────────
  //
  // El edge (Express, loopback contra http://127.0.0.1:3001) no tiene sesión de
  // nadie: consulta secapi ANTES de saber quién se está logueando. Estos cuatro
  // son los únicos que la api-key abre; con la key en la mano no se llega a
  // ningún otro endpoint (`SERVICIO_FUERA_DE_ALCANCE`).
  {
    patron: "/usuarios/por-username",
    metodos: ["GET"],
    nivel: "SERVICIO",
    motivo:
      "Primer paso del login dual de Granel (edge/src/docs/secapi.js:68 existeEnSecapi): decide si el gestor se valida contra secapi o contra GeneXus. Si esto devuelve != 200, existeEnSecapi retorna null y el login cae en silencio al camino equivocado: todo gestor que solo exista en secapi recibe 'credenciales inválidas' sin ningún error visible.",
  },
  {
    patron: "/roles",
    metodos: ["GET"],
    nivel: "SERVICIO",
    motivo:
      "Grilla tipo-x-rol del panel de root de Granel (listarRolesGranel, aplicacionId=6). Sin esto la pantalla de configuración tira 'secapi roles HTTP 401'.",
  },
  {
    patron: "/roles/:id/atributos",
    metodos: ["GET", "PUT"],
    nivel: "SERVICIO",
    motivo:
      "Lectura y escritura del atributo GranelTiposDoc por rol (atributosDeRol / guardarTiposDeRol, este último desde configRouter.js:269). Es la ÚNICA escritura que la api-key habilita, y por eso el POST del mismo path queda en AUTENTICADA: ese lo usa el front de secapi, no Granel.",
  },

  // ── Root ──────────────────────────────────────────────────────────────────
  //
  // Dos familias distintas conviven acá:
  //
  //   a) Operaciones masivas sobre la base (las dos de siempre).
  //   b) TODO lo que puede alterar QUIÉN TIENE QUÉ. Esto es nuevo y es la
  //      contrapartida obligatoria de que root haya pasado a ser un ROL: el
  //      privilegio ahora vive en `usuario_roles`, o sea en una tabla de datos
  //      que estos endpoints escriben. Mientras estuvieron en AUTENTICADA, un
  //      solo request de cualquiera de los 854 usuarios se otorgaba root de
  //      todo:
  //
  //        PUT  /api/db/usuarios/<yo>/roles  { "roles":[{"rolId":57}] }
  //        POST /api/db/roles  { "aplicacionId":1, "nombre":"root" }   (+ el PUT de arriba)
  //
  //      El segundo funciona porque el rol se identifica por NOMBRE: fabricar
  //      un rol llamado "Root" es fabricar el privilegio. Por eso no alcanza
  //      con cerrar la asignación: hay que cerrar también todo lo que puede
  //      crear, renombrar, clonar o recablear un rol.
  //
  // NO se puede gatear con `usuarios.modifica_permisos`: en producción está en
  // 'N' para los 854 usuarios, así que gatear con eso deja a TODO EL MUNDO
  // afuera, root incluido.
  //
  // Consecuencia asumida y explícita: administrar permisos en el panel de
  // secapi (asignar roles, ABM de roles, funcionalidades, objetos, accesos
  // directos, aplicaciones y el builder de menú) pasa a ser exclusivo de los
  // usuarios con el rol Root de secapi — hoy dmedaglia y jgomez. Antes lo podía
  // hacer cualquier usuario logueado, que es precisamente el problema.
  {
    patron: "/usuarios/importar",
    metodos: ["POST"],
    nivel: "ROOT",
    motivo:
      "Crea usuarios en masa desde SGM/LDAP/GSIST. Ya exigía requireRoot por su cuenta; queda declarado acá para que la tabla no mienta.",
  },
  {
    patron: "/admin/import-sgm-preferences",
    metodos: ["POST"],
    nivel: "ROOT",
    motivo:
      "Barrido masivo que reescribe preferencias y asigna el rol Distribuidor sobre TODA la base. Antes solo exigía que la cookie `token` EXISTIERA (ni firma ni vencimiento): alcanzaba con mandar `Cookie: token=x`.",
  },
  {
    patron: "/usuarios/:id/roles",
    metodos: ["PUT"],
    nivel: "ROOT",
    motivo:
      "LA puerta de la escalada: reemplaza la asignación completa de roles de CUALQUIER usuario, y desde que root es un rol, asignarse el rol Root de secapi ES hacerse root de todo. Estaba en AUTENTICADA y el handler no miraba ni quién llamaba ni que el :id fuera el propio. El GET sigue en AUTENTICADA (ver más abajo): leer qué roles tiene alguien no otorga nada.",
  },
  {
    patron: "/usuarios/:id/accesos",
    metodos: ["PUT"],
    nivel: "ROOT",
    motivo:
      "Concesiones DIRECTAS de funcionalidad por usuario (tabla `accesos`, grant/deny). Es la otra mitad del motor de permisos: lo que no se consigue por rol se consigue por acá, funcionalidad por funcionalidad y sobre cualquier usuario. Misma familia que asignar roles.",
  },
  {
    patron: "/accesos",
    metodos: ["POST", "DELETE"],
    nivel: "ROOT",
    motivo:
      "Exactamente lo mismo que /usuarios/:id/accesos PUT pero de a un acceso y en otro path. Cerrar uno solo de los dos no cierra nada. El GET queda en AUTENTICADA: listar accesos es lectura.",
  },
  {
    patron: "/roles",
    metodos: ["POST"],
    nivel: "ROOT",
    motivo:
      "Crear un rol llamado 'Root' en la aplicación 1 ES crear el privilegio de root, porque el rol se identifica por nombre. El `unique(aplicacion, nombre)` no protege: `esRolRoot` normaliza a minúsculas y con trim, así que 'root', 'ROOT' y ' Root ' son tres filas distintas para Postgres y las tres son root para el código. El GET del mismo path sigue en SERVICIO (lo lee el edge de Granel).",
  },
  {
    patron: "/roles/:id",
    metodos: ["PUT", "DELETE"],
    nivel: "ROOT",
    motivo:
      "El PUT puede RENOMBRAR un rol cualquiera a 'Root' (misma escalada que el POST) y además reemplaza el set de funcionalidades del rol, o sea lo que el rol otorga a todos los que lo tienen. El DELETE lo pasa a estado 'I', y un rol inactivo deja de dar root: es el camino para dejar el sistema sin administrador. El GET queda en AUTENTICADA.",
  },
  {
    patron: "/roles/:id/clonar",
    metodos: ["POST"],
    nivel: "ROOT",
    motivo:
      "El clon se crea con el NOMBRE que manda el body y en la aplicación del rol original: clonar cualquier rol de la aplicación 1 llamándolo 'Root' es la misma fabricación de privilegio que POST /roles, por otra puerta. No estaba en ninguno de los dos informes de revisión.",
  },
  {
    patron: "/funcionalidades",
    metodos: ["POST"],
    nivel: "ROOT",
    motivo:
      "Una funcionalidad con `es_publico='S'` hace que el motor conteste GRANTED (razón PUBLIC_FUNCIONALIDAD) a TODO el mundo para los objetos que tenga colgados. Es otorgar acceso sin pasar por roles ni por accesos.",
  },
  {
    patron: "/funcionalidades/:id",
    metodos: ["PUT", "DELETE"],
    nivel: "ROOT",
    motivo:
      "Ídem: el PUT puede prender `es_publico` sobre una funcionalidad EXISTENTE (la que ya cuelga de las pantallas sensibles) y mover su vigencia; el DELETE la desactiva y corta el acceso de todos los que la tenían. El GET queda en AUTENTICADA.",
  },
  {
    patron: "/funcionalidades/:id/acciones",
    metodos: ["PUT"],
    nivel: "ROOT",
    motivo:
      "Reescribe `funcionalidad_objeto_acciones`, que es LA tabla que el motor consulta para saber qué funcionalidad protege qué pantalla. Recablear esto cambia lo que otorga cada rol sin tocar ningún rol.",
  },
  {
    patron: "/objetos",
    metodos: ["POST"],
    nivel: "ROOT",
    motivo:
      "Un objeto con `es_publico='S'` da GRANTED (razón PUBLIC_OBJECT) a todo el mundo antes de mirar funcionalidades, roles o accesos. Es el cortocircuito más corto del motor.",
  },
  {
    patron: "/objetos/:id",
    metodos: ["PUT", "DELETE"],
    nivel: "ROOT",
    motivo:
      "Ídem sobre objetos existentes, y además reescribe sus `objeto_acciones` (key, codigo y `path`), que es contra lo que matchea el motor. El GET queda en AUTENTICADA.",
  },
  {
    patron: "/aplicaciones",
    metodos: ["POST"],
    nivel: "ROOT",
    motivo:
      "Alta de aplicaciones. Va con el resto del ABM del modelo de autorización: una aplicación es el contenedor de roles, funcionalidades y objetos.",
  },
  {
    patron: "/aplicaciones/:id",
    metodos: ["PUT", "DELETE"],
    nivel: "ROOT",
    motivo:
      "Las dos pueden poner una aplicación en estado 'I', y una aplicación inactiva ya no otorga root (ver `aplicacionesRootDe`): dar de baja la aplicación 1 deja al sistema SIN NINGÚN root, sin tocar un solo rol. Recuperación: scripts/bootstrap-root.ts. El GET queda en AUTENTICADA.",
  },
  {
    patron: "/menu/builder",
    metodos: ["PUT"],
    nivel: "ROOT",
    motivo:
      "Reescribe el árbol entero: crea y ACTUALIZA `objetos` y `objeto_acciones` de la aplicación, incluidos el `path` y el `codigo` contra los que matchea el motor de permisos. Repuntar una acción ya otorgada a otra pantalla es otorgar esa pantalla. El GET queda en AUTENTICADA.",
  },
  {
    patron: "/usuarios/:id",
    metodos: ["DELETE"],
    nivel: "ROOT",
    motivo:
      "Baja lógica (estado='I'). No otorga root, pero lo QUITA: `resolveUsuario` no autentica usuarios inactivos, así que dar de baja a los dos roots deja la instalación sin administrador y sin vuelta por la aplicación. Estaba en AUTENTICADA y el handler no chequeaba nada — el PUT del mismo path sí exigía root para cambiar `estado`, con lo cual el control se saltaba usando DELETE. No lo reportó ninguno de los dos revisores.",
  },

  // ── Autenticadas: el resto del RBAC ───────────────────────────────────────
  //
  // Nivel deliberado: "usuario con sesión válida", no "usuario con permiso sobre
  // este objeto". Subir a permiso fino exigiría pasar cada pantalla del panel de
  // secapi por el motor de permisos y romper a todo admin que hoy no es root.
  // Eso es otro trabajo; lo que se cierra acá es el acceso ANÓNIMO, que era el
  // agujero.
  {
    patron: "/permisos",
    metodos: ["POST"],
    nivel: "AUTENTICADA",
    motivo:
      "Gate de CADA pantalla de Goya, TrackMovil y del propio panel de secapi. Las tres ya mandan el Bearer del usuario. Es el endpoint más caliente del ecosistema: si corta de más, todos terminan en /no-autorizado.",
  },
  {
    patron: "/menu",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "Fallaba ABIERTO: sin token (o con token inválido) devolvía el árbol de menú COMPLETO. Goya lo llama con el Bearer solo `if (token)` (menuApp/route.ts:30), así que quien no tenga cookie pasa de ver todo el menú a ver 401. Es el cambio de comportamiento buscado, no un daño colateral.",
  },
  {
    patron: "/menu/builder",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "Lectura del árbol para el editor. Solo GET: el PUT subió a ROOT (reescribe `objetos` y `objeto_acciones`, incluido el `path` contra el que matchea el motor).",
  },
  {
    patron: "/usuarios/yo",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "'¿Quién soy y soy root?' resuelto del token. Nivel AUTENTICADA y NO ROOT a propósito: preguntar si sos root no puede exigir ser root — con ROOT el no-root recibiría 403 y la UI no podría distinguir 'no sos root' de 'se cayó algo'. Existe porque el panel venía leyendo `user.isRoot` de localStorage, que sale del login de GeneXus (USEREXTENDED) y en producción está INVERTIDO respecto de secapi.",
  },
  {
    patron: "/usuarios",
    metodos: ["GET", "POST"],
    nivel: "AUTENTICADA",
    motivo:
      "Grilla y alta de usuarios del panel de secapi. El alta ya no otorga root: `esRoot` dejó de autorizar y el handler rechaza el intento de crearlo en 'S' (root se otorga asignando el rol Root).",
  },
  {
    patron: "/usuarios/:id",
    metodos: ["GET", "PUT"],
    nivel: "AUTENTICADA",
    motivo:
      "Ficha de usuario del panel. El PUT ya no puede elevar a root: `esRoot` dejó de autorizar y el handler rechaza cambiarlo (root se otorga en /usuarios/:id/roles, asignando el rol Root de la aplicación).",
  },
  {
    patron: "/usuarios/:id/roles",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "Lectura de los roles asignados a un usuario (ficha y modal del panel). Solo GET: el PUT del mismo path subió a ROOT porque asignarse el rol Root ES hacerse root.",
  },
  {
    patron: "/usuarios/:id/atributos",
    metodos: ["GET", "PUT", "POST"],
    nivel: "AUTENTICADA",
    motivo: "Preferencias por usuario (escenario, empresa fletera) del panel de secapi.",
  },
  {
    patron: "/usuarios/:id/accesos",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "Lectura de los accesos directos de un usuario. Solo GET: el PUT del mismo path subió a ROOT (otorga funcionalidades sin pasar por roles).",
  },
  {
    patron: "/usuarios/:id/permite-login",
    metodos: ["POST"],
    nivel: "AUTENTICADA",
    motivo:
      "Lo llama TrackMovil (/admin/usuarios-empresa) forwardeando el Authorization del navegador; el token ya viajaba, secapi no lo miraba.",
  },
  {
    patron: "/usuarios/por-empresa-fletera",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo: "Pantalla /admin/usuarios-empresa de TrackMovil; ya forwardea el Authorization.",
  },
  {
    patron: "/usuarios/externos",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "Enumera los usuarios de SGM/LDAP/GSIST (nombres, mails y cédulas de toda la empresa). Ya exigía token, pero sin verificar la firma.",
  },
  {
    patron: "/roles/:id",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "Ficha de un rol del panel de secapi. Solo lectura: el PUT y el DELETE del mismo path subieron a ROOT (renombrar un rol a 'Root' es otorgarse root).",
  },
  {
    patron: "/roles/:id/atributos",
    metodos: ["POST"],
    nivel: "AUTENTICADA",
    motivo:
      "Alta de un atributo suelto de rol, solo desde el front de secapi (api.ts:1907). Granel usa GET y PUT: por eso el POST NO entra en el alcance de la api-key.",
  },
  {
    patron: "/aplicaciones",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "Grilla de aplicaciones del panel. Solo lectura: el alta subió a ROOT.",
  },
  {
    patron: "/aplicaciones/:id",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "Ficha de una aplicación. Solo lectura: el PUT y el DELETE subieron a ROOT (dar de baja la aplicación 1 deja al sistema sin root).",
  },
  {
    patron: "/aplicaciones/:id/roles",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo: "Roles de una aplicación, para los selectores del panel.",
  },
  {
    patron: "/funcionalidades",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "Grilla de funcionalidades del panel. Solo lectura: el alta subió a ROOT.",
  },
  {
    patron: "/funcionalidades/:id",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "Ficha de una funcionalidad. Solo lectura: el PUT y el DELETE subieron a ROOT (`es_publico='S'` otorga la pantalla a todo el mundo).",
  },
  {
    patron: "/funcionalidades/:id/acciones",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "Lectura del vínculo funcionalidad ↔ objeto/acción. Solo GET: el PUT subió a ROOT porque reescribe la tabla que el motor consulta para saber qué protege qué.",
  },
  {
    patron: "/objetos",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "Grilla de objetos (pantallas y puntos de menú). Solo lectura: el alta subió a ROOT.",
  },
  {
    patron: "/objetos/:id",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "Ficha de un objeto. Solo lectura: el PUT y el DELETE subieron a ROOT (`es_publico='S'` y el recableado de `objeto_acciones` otorgan acceso).",
  },
  {
    patron: "/acciones",
    metodos: ["GET", "POST"],
    nivel: "AUTENTICADA",
    motivo:
      "ABM del catálogo `acciones`. QUEDA en AUTENTICADA a propósito, y es la única excepción del ABM: esta tabla (y su vínculo `funcionalidad_acciones`) NO la lee el motor de permisos — el motor trabaja contra `objeto_acciones` y `funcionalidad_objeto_acciones`, que son otras. Tocar esto no otorga ni quita acceso a nada; es un catálogo descriptivo.",
  },
  {
    patron: "/acciones/:id",
    metodos: ["GET", "PUT", "DELETE"],
    nivel: "AUTENTICADA",
    motivo:
      "Ídem: catálogo descriptivo que el motor no consulta. Ver el motivo de /acciones.",
  },
  {
    patron: "/accesos",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "Listado de accesos directos. Solo GET: el POST y el DELETE subieron a ROOT — son la misma operación que /usuarios/:id/accesos PUT, de a uno.",
  },
  {
    patron: "/solicitudes",
    metodos: ["GET", "POST"],
    nivel: "AUTENTICADA",
    motivo:
      "Solicitudes de acceso. Ya exigían token (sin verificar firma); el handler además resuelve al solicitante con resolveUsuario.",
  },
  {
    patron: "/solicitudes/mias",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo: "Solicitudes del propio usuario.",
  },
  {
    patron: "/solicitudes/:id/aprobar",
    metodos: ["POST"],
    nivel: "AUTENTICADA",
    motivo:
      "Quién puede aprobar lo sigue decidiendo el handler (usuarioPuedeAprobar): acá solo se exige que haya una sesión real detrás.",
  },
  {
    patron: "/solicitudes/:id/rechazar",
    metodos: ["POST"],
    nivel: "AUTENTICADA",
    motivo: "Ídem aprobar.",
  },
  {
    patron: "/usuario-preferencias/sugerencias",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo: "Sugerencias de atributos ya usados, para el autocompletado del panel.",
  },
];

// ─── Resolución de la política ──────────────────────────────────────────────

/**
 * Políticas ordenadas de más específica a menos, para que `/usuarios/externos`
 * gane sobre `/usuarios/:id` — igual que el router de Next, que resuelve el
 * segmento literal antes que el dinámico.
 */
const POLITICAS_ORDENADAS = POLITICAS.map((p) => ({
  ...p,
  regex: patternToRegex(p.patron),
  peso: specificity(p.patron),
})).sort((a, b) => b.peso - a.peso);

/** `/api/db/usuarios/12` → `/usuarios/12`. Devuelve null si no cae bajo el prefijo. */
export function rutaRelativa(pathname: string): string | null {
  const limpio = pathname.replace(/\/+$/, "") || "/";
  if (limpio === PREFIJO_API_DB) return "/";
  if (!limpio.startsWith(PREFIJO_API_DB + "/")) return null;
  return limpio.slice(PREFIJO_API_DB.length);
}

/**
 * Nivel declarado para (path, método), o `null` si no hay política.
 *
 * `null` NO significa "abierta": significa que nadie decidió, y el guard
 * deniega. Es la diferencia entre olvidarse y dejar entrar.
 */
export function nivelDeRuta(pathname: string, metodo: string): NivelAcceso | null {
  const relativa = rutaRelativa(pathname);
  if (relativa === null) return null;

  const m = metodo.toUpperCase();
  for (const p of POLITICAS_ORDENADAS) {
    if (!p.regex.test(relativa)) continue;
    if (!p.metodos.includes(m as Metodo)) continue;
    return p.nivel;
  }
  return null;
}

// ─── Api-key de servicio ────────────────────────────────────────────────────

/**
 * Largo mínimo de la api-key. Mismo criterio que JWT_SECRET: una key corta se
 * adivina, y esta abre el login de Granel.
 */
export const LARGO_MINIMO_CLAVE_SERVICIO = 32;

/**
 * Header de la api-key. El MISMO que ya usa el repo para salir contra el
 * as400-api (`src/lib/usuarios/sources/as400Users.ts`): una sola convención en
 * la casa, no dos. La diferencia es el sentido — `USERS_API_KEY` es SALIENTE
 * (secapi → as400-api) y `SECAPI_SERVICE_KEY` es ENTRANTE (Granel → secapi).
 * Son dos secretos distintos y no hay que mezclarlos.
 */
export const HEADER_API_KEY = "x-api-key";

/**
 * Keys aceptadas, de `SECAPI_SERVICE_KEY`. Se admite lista separada por comas
 * para poder ROTAR sin coordinar el reinicio de secapi y el de Granel en el
 * mismo segundo: se agrega la nueva, se despliega Granel, se saca la vieja.
 *
 * Se lee en cada request (no al importar el módulo) por lo mismo que
 * `leerSecretoJwt`: un cambio de ambiente no debería exigir reiniciar para
 * volver a evaluarse.
 */
function clavesDeServicio(): string[] {
  return (process.env.SECAPI_SERVICE_KEY ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length >= LARGO_MINIMO_CLAVE_SERVICIO);
}

/** Comparación en tiempo constante: comparar keys con `===` filtra el prefijo. */
function igualSinTiming(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** ¿Vino una api-key de servicio válida? `null` = no vino ninguna. */
export function claveDeServicioValida(req: NextRequest): boolean | null {
  const presentada = req.headers.get(HEADER_API_KEY)?.trim();
  if (!presentada) return null;

  const aceptadas = clavesDeServicio();
  if (aceptadas.length === 0) {
    console.error(
      "[apiGuard] llegó una x-api-key pero SECAPI_SERVICE_KEY no está seteada (o es más corta que " +
        `${LARGO_MINIMO_CLAVE_SERVICIO} caracteres): se rechaza.`,
    );
    return false;
  }
  return aceptadas.some((k) => igualSinTiming(k, presentada));
}

// ─── Resultado del guard ────────────────────────────────────────────────────

export type CodigoApiAuth =
  | "SIN_POLITICA" // 403 — ruta/método sin política declarada: fail-closed
  | "SIN_TOKEN" // 401 — ni Authorization, ni cookie `token`, ni api-key válida
  | "TOKEN_INVALIDO" // 401 — firma que no cierra, o malformado
  | "TOKEN_VENCIDO" // 401 — firma válida, `exp` pasado
  | "USUARIO_NO_ENCONTRADO" // 401 — el token nombra a alguien que no está activo
  | "NO_ROOT" // 403 — sesión válida sin el rol Root de SecuritySuite
  | "SERVICIO_FUERA_DE_ALCANCE" // 403 — api-key válida en un endpoint que no le toca
  | "SECRETO_NO_CONFIGURADO" // 503 — JWT_SECRET ausente, corta o con el default del código
  | "ERROR_GUARD"; // 503 — fail-closed: no se pudo decidir

export type ResultadoApiAuth =
  | {
      ok: true;
      nivel: NivelAcceso;
      /** null en PUBLICA y en SERVICIO resuelto por api-key. */
      usuario: UsuarioAuth | null;
      /** true si entró con la api-key de servicio y no con una sesión de usuario. */
      viaServicio: boolean;
    }
  | { ok: false; status: number; code: CodigoApiAuth; respuesta: NextResponse };

/**
 * Mensaje para el consumidor. NUNCA se devuelve el `code` en el body: son
 * nombres internos (mismo criterio que `mensajeDenegacion` de
 * /usuarios/importar). El code viaja en el header `x-auth-guard`, que es lo que
 * mira el que está debuggeando un 401, no el usuario que ve el cartel.
 */
function mensajeDe(code: CodigoApiAuth): string {
  switch (code) {
    case "SIN_TOKEN":
      return "Falta la credencial de acceso";
    case "TOKEN_INVALIDO":
    case "TOKEN_VENCIDO":
    case "USUARIO_NO_ENCONTRADO":
      return "Tu sesión no es válida, volvé a iniciar sesión";
    case "NO_ROOT":
      return "Esta operación requiere ser root";
    case "SIN_POLITICA":
    case "SERVICIO_FUERA_DE_ALCANCE":
      return "No tenés acceso a este recurso";
    case "SECRETO_NO_CONFIGURADO":
    case "ERROR_GUARD":
      return "El servidor no está configurado para autorizar esta operación; avisá a sistemas";
  }
}

function denegar(status: number, code: CodigoApiAuth): ResultadoApiAuth {
  const respuesta = NextResponse.json(
    { success: false, error: mensajeDe(code) },
    { status, headers: { "x-auth-guard": code } },
  );
  return { ok: false, status, code, respuesta };
}

// ─── El guard ───────────────────────────────────────────────────────────────

export interface DependenciasApiGuard {
  /** Resuelve el usuario del JWT. Por defecto, el helper de @/lib/permisos. */
  resolveUsuario: (req: NextRequest) => Promise<UsuarioAuth | null>;
}

const dependenciasReales: DependenciasApiGuard = { resolveUsuario };

/**
 * Construye el guard con sus dependencias. La app usa la instancia por defecto
 * (`requireApiAuth`); los tests crean una con un `resolveUsuario` falso, sin
 * base de datos de por medio.
 */
export function crearGuardApi(deps: DependenciasApiGuard = dependenciasReales) {
  /**
   * Gate de un route handler de /api/db. Va como PRIMERA línea del handler:
   *
   *     const gate = await requireApiAuth(request);
   *     if (!gate.ok) return gate.respuesta;
   *
   * El orden es el mismo que el del guard de /docs, y no es casual:
   *   1. ¿Hay política para esta ruta+método? Si no, se deniega.
   *   2. ¿Es pública? Entonces no se mira nada más.
   *   3. Api-key de servicio, y solo donde corresponde.
   *   4. ¿Vino token?
   *   5. ¿El secreto sirve? Si no, 503: mala configuración no es pase libre.
   *   6. Firma y vencimiento (local, sin tocar la base).
   *   7. Recién ahí, el usuario contra Postgres.
   */
  async function requireApiAuth(req: NextRequest): Promise<ResultadoApiAuth> {
    const pathname = req.nextUrl.pathname;
    const nivel = nivelDeRuta(pathname, req.method);

    if (nivel === null) {
      // Ruta nueva sin política, o método que la tabla no contempla. Se deniega
      // y se loguea fuerte: es un bug de configuración, no un ataque.
      console.error(
        `[apiGuard] ${req.method} ${pathname} no tiene política declarada en POLITICAS ` +
          "(src/lib/auth/apiGuard.ts). Se deniega por fail-closed.",
      );
      return denegar(403, "SIN_POLITICA");
    }

    if (nivel === "PUBLICA") {
      return { ok: true, nivel, usuario: null, viaServicio: false };
    }

    // La api-key se mira antes que el JWT porque el llamador server-to-server no
    // tiene sesión de nadie y no va a traer token nunca.
    const conClave = claveDeServicioValida(req);
    if (conClave === true) {
      if (nivel !== "SERVICIO") {
        // La key es válida pero este endpoint no está en su alcance. Es el punto
        // de todo: que la credencial de Granel no sea una llave maestra.
        console.warn(
          `[apiGuard] api-key de servicio válida usada en ${req.method} ${pathname}, ` +
            "que no es de nivel SERVICIO. Se deniega.",
        );
        return denegar(403, "SERVICIO_FUERA_DE_ALCANCE");
      }
      return { ok: true, nivel, usuario: null, viaServicio: true };
    }
    if (conClave === false) {
      console.warn(`[apiGuard] api-key inválida en ${req.method} ${pathname}`);
      // No se corta acá: puede venir además un Bearer legítimo. Si no viene,
      // igual termina en SIN_TOKEN.
    }

    let token: string | null;
    try {
      token = extractToken(req);
    } catch {
      return denegar(401, "TOKEN_INVALIDO");
    }
    if (!token || !token.trim()) return denegar(401, "SIN_TOKEN");

    const secreto = leerSecretoJwt();
    if (!secreto.ok) {
      console.error(
        `[apiGuard] ${secreto.motivo}. /api/db queda cerrado hasta configurarla (ver docs/api/README.md).`,
      );
      return denegar(503, "SECRETO_NO_CONFIGURADO");
    }

    const verificado = verificarJwt(token, secreto.secreto);
    if (!verificado.ok) {
      if (verificado.codigo === "ERROR_VERIFICACION") return denegar(503, "ERROR_GUARD");
      return denegar(401, verificado.codigo);
    }

    let usuario: UsuarioAuth | null;
    try {
      usuario = await deps.resolveUsuario(req);
    } catch (error) {
      // Fail-closed. Nada de "si la base no contesta, dejalo pasar".
      console.error("[apiGuard] error resolviendo el usuario", error);
      return denegar(503, "ERROR_GUARD");
    }

    // 401 y no 403: el token es válido pero no corresponde a un usuario activo.
    // Para el front eso significa "volvé a loguearte", y eso lo dispara el 401.
    if (!usuario) return denegar(401, "USUARIO_NO_ENCONTRADO");

    // Root = rol "Root" de SecuritySuite (no la columna `usuarios.es_root`).
    // El cálculo vive en `resolveUsuario`; acá solo se lee el resultado.
    if (nivel === "ROOT" && !usuario.esRootDeSecapi) return denegar(403, "NO_ROOT");

    return { ok: true, nivel, usuario, viaServicio: false };
  }

  return { requireApiAuth };
}

export const requireApiAuth = crearGuardApi().requireApiAuth;
