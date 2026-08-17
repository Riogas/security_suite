import { NextRequest, NextResponse } from "next/server";
import { requireRoot as requireRootReal, type ResultadoGuard } from "@/lib/docs/root-guard";
import { extractToken } from "@/lib/permisos";
import { ejecutarTry } from "@/lib/docs/try-request";

// =====================================================================
// El manejador de `POST /api/docs/try`, separado del route handler para poder
// ejercitarlo sin servidor ni base.
//
// El route file de Next solo puede exportar los métodos HTTP y su config: si el
// gate y el armado del contexto vivieran ahí, el único modo de probar "un
// usuario que no es root recibe 403" sería levantar la app y tener una base
// con datos. Acá las dependencias se inyectan y el test las reemplaza.
//
// El orden es la garantía: **primero el guard, después todo lo demás**. Ni el
// cuerpo se parsea antes de saber quién está del otro lado.
// =====================================================================

export interface DependenciasManejadorTry {
  requireRoot: (request: NextRequest) => Promise<ResultadoGuard>;
  extraerToken: (request: NextRequest) => string | null;
  /** El origen contra el que se ejecuta. Es lo único que define el host. */
  origen: (request: NextRequest) => string;
  /** Inyectable para los tests; en producción, el `fetch` global. */
  fetchImpl?: typeof fetch;
}

/**
 * Por defecto, el origen del propio request. `DOCS_TRY_ORIGEN` existe para el
 * caso en que el `Host` que llega no sea de fiar (un proxy que reenvía el
 * header del cliente sin normalizarlo): seteándola, el ejecutor apunta siempre
 * ahí y el header deja de influir. Solo se aceptan http y https.
 */
export function origenPropio(request: NextRequest): string {
  const configurado = (process.env.DOCS_TRY_ORIGEN ?? "").trim();
  if (configurado) {
    try {
      const url = new URL(configurado);
      if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
      console.error("[API/docs/try] DOCS_TRY_ORIGEN no es http/https; se ignora.");
    } catch {
      console.error("[API/docs/try] DOCS_TRY_ORIGEN no es una URL válida; se ignora.");
    }
  }
  return new URL(request.url).origin;
}

const dependenciasReales: DependenciasManejadorTry = {
  requireRoot: requireRootReal,
  extraerToken: extractToken,
  origen: origenPropio,
};

export function crearManejadorTry(deps: Partial<DependenciasManejadorTry> = {}) {
  const d = { ...dependenciasReales, ...deps };

  return async function manejarTry(request: NextRequest): Promise<NextResponse> {
    // 1. Guard. Antes de mirar el cuerpo, antes de nada.
    const guard = await d.requireRoot(request);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.code }, { status: guard.status });
    }

    // 2. Cuerpo.
    let entrada: unknown;
    try {
      entrada = await request.json();
    } catch {
      return NextResponse.json(
        { error: "PAYLOAD_INVALIDO", detalle: "El cuerpo no es JSON." },
        { status: 400 },
      );
    }

    // 3. Ejecución.
    try {
      const resultado = await ejecutarTry(entrada, {
        origen: d.origen(request),
        token: d.extraerToken(request),
        fetchImpl: d.fetchImpl,
      });

      if (!resultado.ok) {
        return NextResponse.json(
          { error: resultado.code, detalle: resultado.detalle },
          { status: resultado.status },
        );
      }

      const { ok: _ejecutado, ...cuerpo } = resultado;
      return NextResponse.json(cuerpo);
    } catch (error) {
      console.error("[API/docs/try POST]", error);
      return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
    }
  };
}
