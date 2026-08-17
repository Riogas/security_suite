import { NextRequest, NextResponse } from "next/server";
import { requireRoot } from "@/lib/docs/root-guard";
import { crearManejadorTry } from "@/lib/docs/try-handler";

// Ejecuta una llamada HTTP y evalúa el guard por request: runtime Node, nunca
// Edge, y sin cachear nada.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// POST /api/docs/try
//
// El "Try it" del portal: ejecuta, del lado del servidor y con la sesión del
// root que está mirando la pantalla, una llamada contra una API de esta misma
// aplicación, y devuelve status, headers y cuerpo.
//
// Auth: SOLO ROOT — el mismo `requireRoot` que `GET /api/docs/spec`. Es
// fail-closed y verifica firma y vencimiento del JWT contra `JWT_SECRET`.
//
// Body: { payload } — `payload` es **base64 de un JSON**
//   { metodo, path, query?, headers?, body?, confirmacion? }
// Codificarlo no es ofuscación: es lo que permite que un cuerpo con sintaxis de
// shell atraviese el WAF de nginx de TrackMovil, que inspecciona el body del
// request entrante. El contrato es idéntico en las tres aplicaciones (spec §5.3).
//
// Reglas, todas en `src/lib/docs/try-request.ts`:
//   - Solo contra el propio host y solo rutas bajo `/api/`. NUNCA es un proxy
//     abierto: URL absolutas, `//host`, backslashes y `..` / `%2e` se rechazan.
//   - GET/HEAD directo. POST/PUT/PATCH/DELETE exigen `confirmacion` igual al
//     path exacto; si no coincide, 428 CONFIRMACION_REQUERIDA.
//   - `authorization` y `cookie` los pone el servidor con la sesión del root:
//     los que mande el cliente se descartan (junto con el resto de la lista
//     negra) y se informan en `x-docs-try-headers-descartados`.
//   - Timeout 30 s, cuerpo truncado a 1 MB.
//
// Respuesta 200: { status, statusText, headers, body, duracionMs, truncado }
//   — el `status` de adentro es el del endpoint probado. Un 500 de la API
//   probada es un resultado, no un error de este endpoint.
// Errores: 400 PAYLOAD_FALTANTE | PAYLOAD_INVALIDO | METODO_NO_PERMITIDO |
//              RUTA_INVALIDA | RUTA_ABSOLUTA | RUTA_CON_TRAVERSAL |
//              RUTA_FUERA_DE_API | RECURSION_NO_PERMITIDA | HEADER_INVALIDO
//          401 SIN_TOKEN | TOKEN_INVALIDO | TOKEN_VENCIDO
//          403 USUARIO_NO_ENCONTRADO | NO_ROOT
//          428 CONFIRMACION_REQUERIDA
//          502 ERROR_DE_RED · 504 TIMEOUT
//          503 SECRETO_NO_CONFIGURADO | ERROR_GUARD
//
// La lógica vive en `src/lib/docs/try-handler.ts` para poder probarla sin
// levantar el servidor (`scripts/test-docs-try.ts`). `requireRoot` se nombra
// acá a propósito: que el gate se lea en el route file, no solo en el helper.
// =====================================================================

const manejar = crearManejadorTry({ requireRoot });

export async function POST(request: NextRequest): Promise<NextResponse> {
  return manejar(request);
}
