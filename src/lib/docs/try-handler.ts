import { NextRequest, NextResponse } from "next/server";
import { requireRoot as requireRootReal, type ResultadoGuard } from "@/lib/docs/root-guard";
import { extractToken } from "@/lib/permisos";
import { ejecutarTry, type EventoAuditoria } from "@/lib/docs/try-request";

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

/**
 * Puerto por defecto del proceso: el que usan `pnpm dev` y `pnpm start`
 * (`next dev|start -p 4005`). En producción PM2 exporta `PORT=3001`, así que el
 * loopback sale bien en los dos casos sin configurar nada.
 */
export const PUERTO_POR_DEFECTO = 4005;

/** El nombre de la env, uno solo, documentado en `docs/api/README.md`. */
export const ENV_ORIGEN = "DOCS_TRY_ORIGEN";

export type ResultadoOrigen = { ok: true; origen: string } | { ok: false; motivo: string };

/**
 * El origen contra el que se ejecuta la llamada. **No sale de ningún header.**
 *
 * `Host`, `x-forwarded-host`, `Origin` y `Referer` los elige quien manda el
 * request. Derivar de ahí el destino del `fetch` convierte este endpoint en un
 * SSRF que además viaja con la sesión del root: un `Host: 169.254.169.254` y el
 * portal sale a buscar el metadata del cloud; un `Host: localhost:5432` y sale
 * a golpear Postgres. Por eso el orden de resolución es cerrado:
 *
 *   1. `DOCS_TRY_ORIGEN`, si está seteada — se usa tal cual (http o https).
 *   2. Si no está: `http://127.0.0.1:<PORT del proceso>`, con el default del
 *      repo. Es la propia app, por loopback, sin pasar por el proxy.
 *   3. Nunca un header. Si ninguna de las dos da un origen de confianza, el
 *      endpoint responde 503 `ORIGEN_NO_CONFIGURADO` y no ejecuta nada.
 *
 * Una `DOCS_TRY_ORIGEN` mal escrita no cae en silencio al loopback: si alguien
 * la configuró es porque el loopback no alcanzaba, y adivinar en su lugar es
 * ejecutar contra un ambiente que nadie pidió. Falla y lo dice.
 *
 * Se lee en cada request y no al importar el módulo, para que cambiar la
 * configuración no obligue a reiniciar el proceso para volver a evaluarla.
 */
export function resolverOrigenDeConfianza(): ResultadoOrigen {
  const configurado = (process.env[ENV_ORIGEN] ?? "").trim();
  if (configurado !== "") {
    let url: URL;
    try {
      url = new URL(configurado);
    } catch {
      return { ok: false, motivo: `${ENV_ORIGEN} no es una URL válida: ${configurado}` };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, motivo: `${ENV_ORIGEN} tiene que ser http o https: ${configurado}` };
    }
    return { ok: true, origen: url.origin };
  }

  const crudo = (process.env.PORT ?? "").trim();
  if (crudo === "") return { ok: true, origen: `http://127.0.0.1:${PUERTO_POR_DEFECTO}` };

  const puerto = Number(crudo);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    return {
      ok: false,
      motivo: `PORT no es un puerto válido (${crudo}) y ${ENV_ORIGEN} no está seteada`,
    };
  }
  return { ok: true, origen: `http://127.0.0.1:${puerto}` };
}

// ─── Anti-CSRF ──────────────────────────────────────────────────────────────

function hostDe(valor: string | null | undefined): string | null {
  if (!valor) return null;
  try {
    return new URL(valor).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * ¿El request viene de otra página?
 *
 * Defensa en profundidad. Hoy la cookie de sesión es `SameSite=Lax` y un POST
 * cross-site no la lleva, pero eso es una propiedad de la cookie, no de este
 * endpoint: el día que alguien la afloje —o que el portal empiece a mandar el
 * token de otra forma— la única red sería esta.
 *
 * Se compara contra los hosts por los que la app *puede* haber sido llamada.
 * Que uno de ellos salga del header `Host` no reabre el agujero del SSRF: acá
 * no se decide a dónde sale el `fetch` (eso ya lo fijó
 * `resolverOrigenDeConfianza`), sino solo si el `Origin` que puso el navegador
 * coincide con la dirección que ese mismo navegador escribió. Un navegador no
 * puede mentir en `Host` cross-origin, y quien pueda falsificar los dos ya no
 * necesita la cookie de la víctima para nada.
 *
 * `Origin: null` (iframe sandboxeado, redirección) no coincide con nada y se
 * rechaza: no es esta app.
 */
export function origenAjeno(request: NextRequest, origenDeConfianza: string): boolean {
  const enviado = request.headers.get("origin");
  if (!enviado) return false; // navegación normal o cliente no-browser: nada que comparar

  const host = hostDe(enviado);
  if (!host) return true;

  const permitidos = new Set<string>();
  for (const nombre of ["x-forwarded-host", "host"]) {
    const valor = request.headers.get(nombre);
    if (valor) permitidos.add(valor.split(",")[0].trim().toLowerCase());
  }
  const propio = hostDe(origenDeConfianza);
  if (propio) permitidos.add(propio);

  return !permitidos.has(host);
}

// ─── Manejador ──────────────────────────────────────────────────────────────

export interface DependenciasManejadorTry {
  requireRoot: (request: NextRequest) => Promise<ResultadoGuard>;
  extraerToken: (request: NextRequest) => string | null;
  /**
   * El origen de confianza contra el que se ejecuta. No recibe el request a
   * propósito: nada de lo que mande el cliente puede influir en el destino.
   */
  origen: () => ResultadoOrigen;
  /** El rastro de auditoría. Por defecto, al log del proceso. */
  auditar: (usuario: string, evento: EventoAuditoria) => void;
  /** Inyectable para los tests; en producción, el `fetch` global. */
  fetchImpl?: typeof fetch;
}

/** Mismo formato que trackmovil, para que los tres logs se lean igual. */
export function registrarEnLog(usuario: string, evento: EventoAuditoria): void {
  console.info(
    `[docs/try] ${usuario || "root"} → ${evento.metodo} ${evento.ruta}` +
      (evento.esEscritura ? " (escritura confirmada)" : ""),
  );
}

const dependenciasReales: DependenciasManejadorTry = {
  requireRoot: requireRootReal,
  extraerToken: extractToken,
  origen: resolverOrigenDeConfianza,
  auditar: registrarEnLog,
};

export function crearManejadorTry(deps: Partial<DependenciasManejadorTry> = {}) {
  const d = { ...dependenciasReales, ...deps };

  return async function manejarTry(request: NextRequest): Promise<NextResponse> {
    // 1. Guard. Antes de mirar el cuerpo, antes de nada.
    const guard = await d.requireRoot(request);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.code }, { status: guard.status });
    }

    // 2. Origen de confianza. Si el proceso no sabe contra qué ejecutar, no
    //    ejecuta: adivinarlo con un header es justamente lo que no se hace.
    const origen = d.origen();
    if (!origen.ok) {
      console.error(`[API/docs/try] ${origen.motivo}. Ver docs/api/README.md.`);
      return NextResponse.json(
        { error: "ORIGEN_NO_CONFIGURADO", detalle: origen.motivo },
        { status: 503 },
      );
    }

    // 3. Anti-CSRF, antes de ejecutar nada.
    if (origenAjeno(request, origen.origen)) {
      return NextResponse.json(
        { error: "ORIGEN_INVALIDO", detalle: "El request no viene de esta aplicación." },
        { status: 403 },
      );
    }

    // 4. Cuerpo.
    let entrada: unknown;
    try {
      entrada = await request.json();
    } catch {
      return NextResponse.json(
        { error: "PAYLOAD_INVALIDO", detalle: "El cuerpo no es JSON." },
        { status: 400 },
      );
    }

    // 5. Ejecución.
    try {
      const resultado = await ejecutarTry(entrada, {
        origen: origen.origen,
        token: d.extraerToken(request),
        auditar: (evento) => d.auditar(guard.usuario.username, evento),
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
