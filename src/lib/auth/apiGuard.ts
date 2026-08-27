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
  /** Lo anterior + `usuarios.es_root = 'S'`. */
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
    metodos: ["GET", "PUT"],
    nivel: "AUTENTICADA",
    motivo: "Editor del árbol de menú del panel de secapi (el PUT reescribe el árbol entero).",
  },
  {
    patron: "/usuarios",
    metodos: ["GET", "POST"],
    nivel: "AUTENTICADA",
    motivo:
      "Grilla y alta de usuarios del panel de secapi. El alta acepta `esRoot` en el body: el handler exige ser root para ese campo puntual.",
  },
  {
    patron: "/usuarios/:id",
    metodos: ["GET", "PUT", "DELETE"],
    nivel: "AUTENTICADA",
    motivo:
      "Ficha de usuario del panel. El PUT acepta `esRoot` en el body: el handler exige ser root para tocar ESE campo (elevarse a root no puede depender de una sesión cualquiera).",
  },
  {
    patron: "/usuarios/:id/roles",
    metodos: ["GET", "PUT"],
    nivel: "AUTENTICADA",
    motivo: "Asignación de roles del panel de secapi.",
  },
  {
    patron: "/usuarios/:id/atributos",
    metodos: ["GET", "PUT", "POST"],
    nivel: "AUTENTICADA",
    motivo: "Preferencias por usuario (escenario, empresa fletera) del panel de secapi.",
  },
  {
    patron: "/usuarios/:id/accesos",
    metodos: ["GET", "PUT"],
    nivel: "AUTENTICADA",
    motivo: "Accesos directos por usuario del panel de secapi.",
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
    patron: "/roles",
    metodos: ["POST"],
    nivel: "AUTENTICADA",
    motivo: "Alta de roles del panel de secapi. El GET del mismo path es SERVICIO (lo lee Granel).",
  },
  {
    patron: "/roles/:id",
    metodos: ["GET", "PUT", "DELETE"],
    nivel: "AUTENTICADA",
    motivo: "ABM de roles del panel de secapi.",
  },
  {
    patron: "/roles/:id/atributos",
    metodos: ["POST"],
    nivel: "AUTENTICADA",
    motivo:
      "Alta de un atributo suelto de rol, solo desde el front de secapi (api.ts:1907). Granel usa GET y PUT: por eso el POST NO entra en el alcance de la api-key.",
  },
  {
    patron: "/roles/:id/clonar",
    metodos: ["POST"],
    nivel: "AUTENTICADA",
    motivo: "Clonado de un rol con todas sus funcionalidades, desde el panel.",
  },
  {
    patron: "/aplicaciones",
    metodos: ["GET", "POST"],
    nivel: "AUTENTICADA",
    motivo: "ABM de aplicaciones del panel de secapi.",
  },
  {
    patron: "/aplicaciones/:id",
    metodos: ["GET", "PUT", "DELETE"],
    nivel: "AUTENTICADA",
    motivo: "ABM de aplicaciones del panel de secapi.",
  },
  {
    patron: "/aplicaciones/:id/roles",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo: "Roles de una aplicación, para los selectores del panel.",
  },
  {
    patron: "/funcionalidades",
    metodos: ["GET", "POST"],
    nivel: "AUTENTICADA",
    motivo: "ABM de funcionalidades del panel de secapi.",
  },
  {
    patron: "/funcionalidades/:id",
    metodos: ["GET", "PUT", "DELETE"],
    nivel: "AUTENTICADA",
    motivo: "ABM de funcionalidades del panel de secapi.",
  },
  {
    patron: "/funcionalidades/:id/acciones",
    metodos: ["GET", "PUT"],
    nivel: "AUTENTICADA",
    motivo: "Vínculo funcionalidad ↔ objeto/acción del panel de secapi.",
  },
  {
    patron: "/objetos",
    metodos: ["GET", "POST"],
    nivel: "AUTENTICADA",
    motivo: "ABM de objetos (pantallas y puntos de menú) del panel de secapi.",
  },
  {
    patron: "/objetos/:id",
    metodos: ["GET", "PUT", "DELETE"],
    nivel: "AUTENTICADA",
    motivo: "ABM de objetos del panel de secapi.",
  },
  {
    patron: "/acciones",
    metodos: ["GET", "POST"],
    nivel: "AUTENTICADA",
    motivo: "ABM del catálogo de acciones del panel de secapi.",
  },
  {
    patron: "/acciones/:id",
    metodos: ["GET", "PUT", "DELETE"],
    nivel: "AUTENTICADA",
    motivo: "ABM del catálogo de acciones del panel de secapi.",
  },
  {
    patron: "/accesos",
    metodos: ["GET", "POST", "DELETE"],
    nivel: "AUTENTICADA",
    motivo: "Otorgamiento y revocación de accesos directos, desde el panel de secapi.",
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
  | "NO_ROOT" // 403 — sesión válida sin es_root='S'
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

    if (nivel === "ROOT" && usuario.esRoot !== "S") return denegar(403, "NO_ROOT");

    return { ok: true, nivel, usuario, viaServicio: false };
  }

  return { requireApiAuth };
}

export const requireApiAuth = crearGuardApi().requireApiAuth;
