import { createHash } from "crypto";
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { extractToken, resolveUsuario, type UsuarioAuth } from "@/lib/permisos";

// =====================================================================
// Gate del portal de documentación de APIs (`/docs`).
// Ver docs/superpowers/specs/2026-08-17-portal-docs-apis-design.md §5.2.
//
// El portal lista, entre otras cosas, qué endpoints de esta app no validan
// nada. Por eso el gate corre SIEMPRE del lado del servidor y es FAIL-CLOSED:
// ante cualquier error (base caída, token raro, mala configuración, excepción
// inesperada) deniega.
//
// En secapi el chequeo NO sale por HTTP contra sí mismo: esta app *es* el motor
// de permisos, así que consulta Postgres directo con Prisma.
//
// ── Blindaje del token ──────────────────────────────────────────────────────
// El resto de la app decodifica el JWT sin verificarlo (`decodeJwt` es base64
// puro y ni mira `exp`): cualquiera que arme "Bearer <header>.<base64 de
// {username:'dmedaglia'}>.<x>" se hace pasar por root. Ese agujero se cierra
// ACÁ, solo en el camino de /docs, sin tocar la autenticación general:
//
//   1. `jwt.verify` con `JWT_SECRET`: firma y vencimiento, antes de cualquier
//      consulta a la base y antes del cache.
//   2. `JWT_SECRET` tiene que ser un secreto real. Si no está seteada, o si es
//      el valor que quedó como default en el código, el guard responde 503 y no
//      abre: con un secreto conocido, verificar la firma no prueba nada.
//
// ── Quién es root a los efectos de /docs ────────────────────────────────────
//   a) usuarios.es_root = 'S'                      (bypass global del motor)
//   b) tiene un rol vigente y activo al que se le otorgó la funcionalidad
//      'docs' de la aplicación 1, con la funcionalidad activa, vigente y
//      solo_root='N' (rol_funcionalidades → funcionalidades)
// Es la semántica de POST /api/db/permisos con { AplicacionId: 1,
// ObjetoKey: 'docs', AccionKey: 'view' }, resuelta acá sin salto de red.
// `docs` se sembró con solo_root='N' justamente para que (b) alcance (ver
// scripts/seed-docs-funcionalidad.ts).
// =====================================================================

/** Aplicación 1 = SecuritySuite. La funcionalidad `docs` es por aplicación. */
const APLICACION_ID = Number(
  process.env.NEXT_PUBLIC_APLICACION_ID ?? process.env.APLICACION_ID ?? 1,
);

const NOMBRE_FUNCIONALIDAD = "docs";

const TTL_POSITIVO_MS = 5 * 60 * 1000; // 5 min
const TTL_NEGATIVO_MS = 30 * 1000; // 30 s
/** Tope del cache: son tokens de root, nunca van a ser muchos. */
const MAX_ENTRADAS_CACHE = 200;

/** `src/lib/auth/responses.ts` firma con HS256; no se acepta otra cosa. */
const ALGORITMOS: jwt.Algorithm[] = ["HS256"];

/**
 * SHA-256 del secreto que quedó como *default en el código* para firmar los JWT
 * (el `process.env.JWT_SECRET || "..."` de `src/lib/auth/responses.ts` y de
 * `src/app/api/db/menu/route.ts`).
 *
 * Se compara por digest a propósito: el valor no se vuelve a escribir en claro
 * en ningún archivo nuevo, y menos en los que el propio portal publica.
 * `scripts/test-docs-root-guard.ts` lee el literal del código y verifica que
 * este digest le siga correspondiendo, así que si alguien cambia el default el
 * test falla en vez de que el chequeo quede mudo.
 */
const DIGEST_SECRETO_DE_COMPROMISO =
  "d93d4f2b67f66f09182e7035b51c853cd2ab6f77b96a495f432fe983b7246ddf";

export type ResultadoGuard =
  | { ok: true; usuario: UsuarioAuth }
  | { ok: false; status: number; code: CodigoDenegacion };

export type CodigoDenegacion =
  | "SIN_TOKEN" // 401 — no vino Authorization ni cookie `token`
  | "TOKEN_INVALIDO" // 401 — firma inválida, malformado, o sin usuario
  | "TOKEN_VENCIDO" // 401 — firma válida pero `exp` pasado
  | "USUARIO_NO_ENCONTRADO" // 403 — el token nombra a alguien que no está activo
  | "NO_ROOT" // 403 — usuario válido sin es_root ni funcionalidad `docs`
  | "SECRETO_NO_CONFIGURADO" // 503 — JWT_SECRET ausente o con el default del código
  | "ERROR_GUARD"; // 503 — fail-closed: no se pudo decidir

export interface DependenciasGuard {
  /** Resuelve el usuario del JWT. Por defecto, el helper de @/lib/permisos. */
  resolveUsuario: (req: NextRequest) => Promise<UsuarioAuth | null>;
  /** ¿Algún rol vigente del usuario tiene otorgada la funcionalidad `docs`? */
  tieneFuncionalidadDocs: (usuarioId: number) => Promise<boolean>;
  /** Reloj, inyectable para poder ejercitar el cache en los tests. */
  ahora: () => number;
}

function sha256(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

// ─── Secreto de firma ───────────────────────────────────────────────────────

export type EstadoSecreto = { ok: true; secreto: string } | { ok: false; motivo: string };

/**
 * El secreto con el que se verifica la firma, o el motivo por el que no sirve.
 *
 * Se lee en cada request (no al importar el módulo) para que un cambio de
 * ambiente no exija reiniciar el proceso para volver a evaluarse.
 */
/**
 * Largo mínimo del secreto. Verificar HS256 contra un secreto corto no prueba
 * nada: se rompe offline a partir de cualquier token capturado, y con el
 * secreto en la mano se firma un token de root a mano — que es exactamente el
 * ataque que este guard viene a cerrar.
 */
export const LARGO_MINIMO_SECRETO = 32;

export function leerSecretoJwt(): EstadoSecreto {
  const secreto = (process.env.JWT_SECRET ?? "").trim();

  if (secreto === "") {
    return { ok: false, motivo: "JWT_SECRET no está seteada" };
  }
  if (secreto.length < LARGO_MINIMO_SECRETO) {
    return {
      ok: false,
      motivo: `JWT_SECRET tiene ${secreto.length} caracteres: se exigen al menos ${LARGO_MINIMO_SECRETO}`,
    };
  }
  if (sha256(secreto) === DIGEST_SECRETO_DE_COMPROMISO) {
    return {
      ok: false,
      motivo:
        "JWT_SECRET tiene el valor que quedó como default en el código: es un secreto conocido y verificar la firma con él no prueba nada",
    };
  }
  return { ok: true, secreto };
}

/**
 * Verifica firma y vencimiento. Devuelve `null` si el token está bien, o el
 * resultado con el que hay que cortar.
 *
 * `TokenExpiredError` extiende `JsonWebTokenError`, así que se chequea primero.
 * Cualquier otro error es fail-closed (503), no un pase libre.
 */
function esHexPuro(s: string): boolean {
  return s.length % 2 === 0 && /^[0-9a-f]+$/i.test(s);
}

/**
 * El ecosistema tiene DOS emisores que firman con el MISMO valor de secreto
 * pero derivan bytes distintos de él:
 *
 *   - GeneXus (el login de la UI de secapi, `/loginUser`): la librería
 *     `GeneXusJWT` hace `Hex.decode(secreto)` antes de firmar HS256 — o sea,
 *     con un secreto de 64 hex usa 32 bytes.
 *   - secapi `/api/db/login` (lo usan Goya y TrackMovil, y el propio secapi si
 *     algún día deja de proxyear a GeneXus): `jwt.sign(secreto)` toma el string
 *     como UTF-8 — 64 bytes.
 *
 * Un guard que probara una sola derivación dejaría afuera a la mitad de los
 * usuarios según por dónde entraron. Probar las dos NO amplía la superficie:
 * las dos claves salen del mismo secreto, que el atacante sigue sin tener.
 */
function clavesCandidatas(secreto: string): Array<string | Buffer> {
  const claves: Array<string | Buffer> = [secreto];
  if (esHexPuro(secreto)) claves.push(Buffer.from(secreto, "hex"));
  return claves;
}

function verificarToken(token: string, secreto: string): ResultadoGuard | null {
  let vencido = false;
  for (const clave of clavesCandidatas(secreto)) {
    try {
      jwt.verify(token, clave, { algorithms: ALGORITMOS });
      return null;
    } catch (error) {
      // TokenExpiredError solo se tira DESPUÉS de que la firma cerró: si aparece,
      // esta clave era la correcta y el token venció (no seguimos probando).
      if (error instanceof jwt.TokenExpiredError) {
        vencido = true;
        continue;
      }
      // Firma que no cierra con ESTA clave: puede cerrar con la otra derivación.
      if (error instanceof jwt.JsonWebTokenError) continue;
      // Cualquier otra cosa (p. ej. token que no es string) no depende de la
      // clave: es un error de verdad y corta acá.
      console.error("[docs/root-guard] error inesperado verificando el JWT", error);
      return { ok: false, status: 503, code: "ERROR_GUARD" };
    }
  }
  return { ok: false, status: 401, code: vencido ? "TOKEN_VENCIDO" : "TOKEN_INVALIDO" };
}

// ─── Otorgamiento en base ───────────────────────────────────────────────────

/**
 * Filtro del otorgamiento de `docs` por rol, con la misma semántica que
 * `POST /api/db/permisos`:
 *
 * - funcionalidad de esta aplicación, `estado='A'` y **vigente**
 *   (`fecha_desde` / `fecha_hasta`), igual que el `funcLinks` de permisos;
 * - `solo_root='N'`: permisos descarta las funcionalidades `solo_root='S'` para
 *   quien no es root, y el bypass de `es_root='S'` ya se resolvió antes de
 *   llegar acá (la columna es char(1) con dominio {'S','N'}, así que el `='N'`
 *   de acá y el `!== 'S'` de permisos coinciden);
 * - rol activo y asignación al usuario vigente.
 *
 * Diferencias que quedan con `/api/db/permisos`, a conciencia: no se miran los
 * `accesos` directos por usuario ni `es_publico`. La funcionalidad `docs` se
 * sembró con `es_publico='N'` y se otorga por rol (spec §6); si algún día se
 * concede por acceso directo, hay que sumarlo acá.
 */
export function filtroOtorgamientoDocs(usuarioId: number, ahora: Date) {
  return {
    funcionalidad: {
      nombre: NOMBRE_FUNCIONALIDAD,
      aplicacionId: APLICACION_ID,
      estado: "A",
      soloRoot: "N",
      OR: [{ fechaDesde: null }, { fechaDesde: { lte: ahora } }] as object[],
      AND: [{ OR: [{ fechaHasta: null }, { fechaHasta: { gte: ahora } }] }] as object[],
    },
    rol: {
      estado: "A",
      usuarios: {
        some: {
          usuarioId,
          OR: [{ fechaDesde: null }, { fechaDesde: { lte: ahora } }] as object[],
          AND: [{ OR: [{ fechaHasta: null }, { fechaHasta: { gte: ahora } }] }] as object[],
        },
      },
    },
  };
}

/** Consulta Postgres con el filtro de arriba. */
async function tieneFuncionalidadDocsEnBase(usuarioId: number): Promise<boolean> {
  const otorgamiento = await prisma.rolFuncionalidad.findFirst({
    where: filtroOtorgamientoDocs(usuarioId, new Date()),
    select: { funcionalidadId: true },
  });

  return otorgamiento !== null;
}

const dependenciasReales: DependenciasGuard = {
  resolveUsuario,
  tieneFuncionalidadDocs: tieneFuncionalidadDocsEnBase,
  ahora: () => Date.now(),
};

interface EntradaCache {
  resultado: ResultadoGuard;
  expiraEn: number;
}

/**
 * Construye un guard con sus dependencias y su propio cache. La app usa la
 * instancia por defecto (`requireRoot`); los tests crean una con dependencias
 * falsas, sin base de datos de por medio.
 */
export function crearGuardRoot(deps: DependenciasGuard = dependenciasReales) {
  const cache = new Map<string, EntradaCache>();

  /** El JWT no se guarda en claro como clave del cache (igual que goya y trackmovil). */
  function claveCache(token: string): string {
    return sha256(token);
  }

  function leerCache(clave: string): ResultadoGuard | null {
    const entrada = cache.get(clave);
    if (!entrada) return null;
    if (entrada.expiraEn <= deps.ahora()) {
      cache.delete(clave);
      return null;
    }
    return entrada.resultado;
  }

  function guardarCache(clave: string, resultado: ResultadoGuard): void {
    // Los 5xx no se cachean: si la base volvió (o alguien configuró el secreto),
    // el próximo request tiene que poder entrar sin esperar a que venza nada.
    if (!resultado.ok && resultado.status >= 500) return;

    if (cache.size >= MAX_ENTRADAS_CACHE) {
      const masVieja = cache.keys().next();
      if (!masVieja.done) cache.delete(masVieja.value);
    }
    const ttl = resultado.ok ? TTL_POSITIVO_MS : TTL_NEGATIVO_MS;
    cache.set(clave, { resultado, expiraEn: deps.ahora() + ttl });
  }

  async function evaluar(token: string): Promise<ResultadoGuard> {
    // resolveUsuario() de @/lib/permisos espera un NextRequest; se lo arma con
    // el token para no duplicar acá la resolución de usuario. La firma ya quedó
    // verificada antes de llegar hasta acá.
    const req = new NextRequest("http://docs-guard.local/", {
      headers: { authorization: `Bearer ${token}` },
    });

    const usuario = await deps.resolveUsuario(req);
    if (!usuario) return { ok: false, status: 403, code: "USUARIO_NO_ENCONTRADO" };

    if (usuario.esRoot === "S") return { ok: true, usuario };

    const otorgada = await deps.tieneFuncionalidadDocs(usuario.id);
    if (otorgada) return { ok: true, usuario };

    return { ok: false, status: 403, code: "NO_ROOT" };
  }

  /**
   * Igual que requireRoot pero desde el token crudo (Server Components: `cookies()`).
   *
   * El orden no es casual:
   *   1. ¿Vino un token?      si no, 401 y ni se mira la configuración.
   *   2. ¿El secreto sirve?   si no, 503: fail-closed ante mala configuración.
   *   3. Firma y vencimiento: local y en CADA request. Si esto viviera detrás
   *      del cache, un token vencido seguiría entrando hasta 5 minutos después
   *      de haber vencido.
   *   4. Recién ahí, el cache y la base.
   */
  async function requireRootPorToken(token: string | null): Promise<ResultadoGuard> {
    if (!token || !token.trim()) return { ok: false, status: 401, code: "SIN_TOKEN" };

    const secreto = leerSecretoJwt();
    if (!secreto.ok) {
      // Se loguea el motivo: si no, el root ve un 503 y nadie sabe por qué.
      console.error(
        `[docs/root-guard] ${secreto.motivo}. /docs queda cerrado hasta configurarla (ver docs/api/README.md).`,
      );
      return { ok: false, status: 503, code: "SECRETO_NO_CONFIGURADO" };
    }

    const problema = verificarToken(token, secreto.secreto);
    if (problema) return problema;

    const clave = claveCache(token);
    const enCache = leerCache(clave);
    if (enCache) return enCache;

    let resultado: ResultadoGuard;
    try {
      resultado = await evaluar(token);
    } catch (error) {
      // Fail-closed. Nada de "si la base no contesta, dejalo pasar".
      console.error("[docs/root-guard]", error);
      resultado = { ok: false, status: 503, code: "ERROR_GUARD" };
    }

    guardarCache(clave, resultado);
    return resultado;
  }

  /** Gate de un route handler. Devuelve el usuario o el status con el que cortar. */
  async function requireRoot(request: NextRequest): Promise<ResultadoGuard> {
    let token: string | null;
    try {
      token = extractToken(request);
    } catch {
      return { ok: false, status: 401, code: "TOKEN_INVALIDO" };
    }
    return requireRootPorToken(token);
  }

  /** Solo para tests y para invalidar a mano tras un cambio de permisos. */
  function limpiarCache(): void {
    cache.clear();
  }

  return { requireRoot, requireRootPorToken, limpiarCache };
}

const guardPorDefecto = crearGuardRoot();

export const requireRoot = guardPorDefecto.requireRoot;
export const requireRootPorToken = guardPorDefecto.requireRootPorToken;
export const limpiarCacheGuard = guardPorDefecto.limpiarCache;
