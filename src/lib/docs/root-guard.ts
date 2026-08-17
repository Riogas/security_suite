import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { decodeJwt, extractToken, resolveUsuario, type UsuarioAuth } from "@/lib/permisos";

// =====================================================================
// Gate del portal de documentación de APIs (`/docs`).
// Ver docs/superpowers/specs/2026-08-17-portal-docs-apis-design.md §5.2.
//
// El portal lista, entre otras cosas, qué endpoints de esta app no validan
// nada. Por eso el gate corre SIEMPRE del lado del servidor y es FAIL-CLOSED:
// ante cualquier error (base caída, token raro, excepción inesperada) deniega.
//
// En secapi el chequeo NO sale por HTTP contra sí mismo: esta app *es* el motor
// de permisos, así que consulta Postgres directo con Prisma.
//
// Es root a los efectos de /docs quien cumpla una de estas dos:
//   a) usuarios.es_root = 'S'                      (bypass global del motor)
//   b) tiene un rol vigente y activo al que se le otorgó la funcionalidad
//      'docs' de la aplicación 1 (rol_funcionalidades → funcionalidades)
// Es exactamente la semántica de POST /api/db/permisos con
// { AplicacionId: 1, ObjetoKey: 'docs', AccionKey: 'view' }, resuelta acá sin
// salto de red. `docs` se sembró con solo_root='N' justamente para que (b)
// alcance (ver scripts/seed-docs-funcionalidad.ts).
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

export type ResultadoGuard =
  | { ok: true; usuario: UsuarioAuth }
  | { ok: false; status: number; code: CodigoDenegacion };

export type CodigoDenegacion =
  | "SIN_TOKEN" // 401 — no vino Authorization ni cookie `token`
  | "TOKEN_INVALIDO" // 401 — el JWT no se puede decodificar / no trae usuario
  | "USUARIO_NO_ENCONTRADO" // 403 — el token nombra a alguien que no está activo
  | "NO_ROOT" // 403 — usuario válido sin es_root ni funcionalidad `docs`
  | "ERROR_GUARD"; // 503 — fail-closed: no se pudo decidir

export interface DependenciasGuard {
  /** Resuelve el usuario del JWT. Por defecto, el helper de @/lib/permisos. */
  resolveUsuario: (req: NextRequest) => Promise<UsuarioAuth | null>;
  /** ¿Algún rol vigente del usuario tiene otorgada la funcionalidad `docs`? */
  tieneFuncionalidadDocs: (usuarioId: number) => Promise<boolean>;
  /** Reloj, inyectable para poder ejercitar el cache en los tests. */
  ahora: () => number;
}

/**
 * Consulta Postgres: rol vigente (fecha_desde/fecha_hasta) y activo, al que se
 * le otorgó la funcionalidad `docs` activa de esta aplicación.
 */
async function tieneFuncionalidadDocsEnBase(usuarioId: number): Promise<boolean> {
  const ahora = new Date();

  const otorgamiento = await prisma.rolFuncionalidad.findFirst({
    where: {
      funcionalidad: {
        nombre: NOMBRE_FUNCIONALIDAD,
        aplicacionId: APLICACION_ID,
        estado: "A",
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
    },
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

  function leerCache(token: string): ResultadoGuard | null {
    const entrada = cache.get(token);
    if (!entrada) return null;
    if (entrada.expiraEn <= deps.ahora()) {
      cache.delete(token);
      return null;
    }
    return entrada.resultado;
  }

  function guardarCache(token: string, resultado: ResultadoGuard): void {
    // Los ERROR_GUARD no se cachean: si la base volvió, el próximo request
    // tiene que poder entrar sin esperar a que venza nada.
    if (!resultado.ok && resultado.code === "ERROR_GUARD") return;

    if (cache.size >= MAX_ENTRADAS_CACHE) {
      const masVieja = cache.keys().next();
      if (!masVieja.done) cache.delete(masVieja.value);
    }
    const ttl = resultado.ok ? TTL_POSITIVO_MS : TTL_NEGATIVO_MS;
    cache.set(token, { resultado, expiraEn: deps.ahora() + ttl });
  }

  async function evaluar(token: string): Promise<ResultadoGuard> {
    if (!decodeJwt(token)) return { ok: false, status: 401, code: "TOKEN_INVALIDO" };

    // resolveUsuario() de @/lib/permisos espera un NextRequest; se lo arma con
    // el token para no duplicar acá la resolución de usuario.
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
   * El cache se indexa por token. Esta app no verifica la firma del JWT en
   * ningún lado salvo /api/db/menu, y el portal no es el lugar para cambiar eso
   * (ver §2 "No entra" de la spec): el guard replica la semántica vigente y
   * solo agrega la exigencia de root.
   */
  async function requireRootPorToken(token: string | null): Promise<ResultadoGuard> {
    if (!token || !token.trim()) return { ok: false, status: 401, code: "SIN_TOKEN" };

    const enCache = leerCache(token);
    if (enCache) return enCache;

    let resultado: ResultadoGuard;
    try {
      resultado = await evaluar(token);
    } catch (error) {
      // Fail-closed. Nada de "si la base no contesta, dejalo pasar".
      console.error("[docs/root-guard]", error);
      resultado = { ok: false, status: 503, code: "ERROR_GUARD" };
    }

    guardarCache(token, resultado);
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
