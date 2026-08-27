import { NextRequest, NextResponse } from "next/server";
import { requireRoot } from "@/lib/docs/root-guard";
import { cargarSpecMergeado, SpecNoGeneradoError } from "@/lib/docs/spec";

// Lee docs/api/* del filesystem: runtime Node, nunca Edge, y sin cachear la
// respuesta (el guard se evalúa por request).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// GET /api/docs/spec
//
// Catálogo de las APIs propias de SecuritySuite: docs/api/openapi.json
// (generado por `pnpm docs:api`) mergeado con docs/api/anotaciones.yaml
// (escrito a mano). Las anotaciones ganan sobre lo inferido.
//
// Auth: SOLO ROOT. Pasa por requireRoot(), que es fail-closed y que —a
// diferencia del resto de la app— verifica firma y vencimiento del JWT contra
// JWT_SECRET. El documento incluye qué endpoints de esta app no validan nada:
// es información sensible y es exactamente por eso que el portal es solo-root
// (spec §2 y §7).
//
// Headers: Authorization: Bearer <jwt>   (o cookie "token")
//
// Respuesta 200: el documento OpenAPI 3.1 completo, con `x-anotaciones`
//   { total, anotados, sinAnotar[], huerfanas[] } agregado en la raíz.
// Errores: 401 SIN_TOKEN | TOKEN_INVALIDO | TOKEN_VENCIDO
//          403 USUARIO_NO_ENCONTRADO | NO_ROOT
//          503 SECRETO_NO_CONFIGURADO (JWT_SECRET ausente o con el default del
//              código) | ERROR_GUARD (guard fail-closed) | SPEC_NO_GENERADO
// =====================================================================
export async function GET(request: NextRequest) {
  const guard = await requireRoot(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.code }, { status: guard.status });
  }

  try {
    const { documento } = await cargarSpecMergeado();
    return NextResponse.json(documento);
  } catch (error) {
    if (error instanceof SpecNoGeneradoError) {
      return NextResponse.json(
        { error: "SPEC_NO_GENERADO", detail: error.message },
        { status: 503 },
      );
    }
    console.error("[API/docs/spec GET]", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
