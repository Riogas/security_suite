import { NextRequest } from "next/server";
import { resolveCredentials } from "@/lib/auth/resolveCredentials";
import {
  badRequest,
  buildSuccessResponse,
  forbidden,
  serverError,
  unauthorized,
} from "@/lib/auth/responses";
import { authLog } from "@/lib/auth/logger";

/**
 * POST /api/db/login
 *
 * Flujo de autenticación multi-fuente (PG / SGM-USUMOBILE / GSIST-ADMSEC / LDAP).
 *
 *  - Si el usuario existe en PG: routeo por esExterno + desdeSistema.
 *      esExterno='N' → valida contra PG.
 *      esExterno='S' + desdeSistema='SGM'  → USUMOBILE; fallback a PG si UNAVAILABLE/NOT_FOUND.
 *      esExterno='S' + desdeSistema='LDAP' → LDAP; fallback a PG si UNAVAILABLE/NOT_FOUND.
 *      esExterno='S' + desdeSistema='GSIST'→ ADMSEC.lookup; UsuAutAD='A' va por LDAP (con
 *                                            fallback a ADMSEC), 'G' va directo a ADMSEC.
 *
 *  - Si NO existe en PG y el username es alfa (al menos un no-dígito):
 *      ADMSEC.lookup → árbol UsuAutAD → upsert PG con desdeSistema='LDAP' o 'GSIST'.
 *
 *  - Si NO existe en PG y el username es numérico:
 *      USUMOBILE.validate → si OK upsert con desdeSistema='SGM'.
 *      Si NOT_FOUND/DISABLED/UNAVAILABLE → árbol ADMSEC.
 *
 * Reglas de fallback:
 *  - INVALID_CREDS desde una fuente conectada → 401 directo (sin fallback).
 *  - NOT_FOUND / DISABLED / UNAVAILABLE → degradar al siguiente nodo del árbol.
 *
 * Body: { UserName, Password, Sistema? }
 * Respuesta éxito: { success, token, user, verifiedBy, roles, preferencias, accesos }
 *   verifiedBy ∈ { local-db, sgm, gsist, gsist-fallback, ldap, local-fallback }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { UserName, Password, Sistema } = body || {};

    if (!UserName || !Password) {
      return badRequest("UserName y Password son requeridos");
    }

    const username = String(UserName).trim();
    const sistema = String(Sistema || "").trim();

    authLog.info("intento de login", { username });

    const result = await resolveCredentials(username, String(Password));

    if (!result.ok) {
      switch (result.status) {
        case 400:
          return badRequest(result.message || "Solicitud inválida");
        case 403:
          return forbidden(result.message || "Acceso denegado");
        case 500:
          return serverError(result.message || "Error interno del servidor");
        default:
          return unauthorized(result.message);
      }
    }

    authLog.info("login OK", { username, verifiedBy: result.verifiedBy, usuarioId: result.usuarioId });
    return buildSuccessResponse(result.usuarioId, sistema, result.verifiedBy);
  } catch (error) {
    authLog.error("login error inesperado", { message: (error as Error)?.message });
    return serverError();
  }
}
