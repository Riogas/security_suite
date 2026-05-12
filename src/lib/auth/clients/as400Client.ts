import type {
  AdmsecLookupResult,
  AdmsecValidateResult,
  As400ValidateResult,
  LdapValidateResult,
} from "../types";

const AS400_API_URL = process.env.AS400_API_URL || "";

const TIMEOUT_AS400 = 15000;
const TIMEOUT_LDAP = 8000;
const TIMEOUT_ADMSEC = 15000;

function unavailable<T extends { outcome: string; message?: string }>(message: string): T {
  return { outcome: "UNAVAILABLE", message } as T;
}

async function postJson<T>(path: string, body: unknown, timeoutMs: number, fallback: T): Promise<T> {
  if (!AS400_API_URL) return fallback;
  try {
    const res = await fetch(`${AS400_API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      // 5xx / 4xx del servicio: lo tratamos como UNAVAILABLE para que el orquestador degrade.
      return fallback;
    }
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

// USUMOBILE (numéricos / SGM).
export function validateAs400(username: string, password: string): Promise<As400ValidateResult> {
  return postJson<As400ValidateResult>(
    "/api/auth/as400",
    { username, password },
    TIMEOUT_AS400,
    unavailable<As400ValidateResult>("AS400 API no disponible")
  );
}

// LDAP / Active Directory.
export function validateLdap(username: string, password: string): Promise<LdapValidateResult> {
  return postJson<LdapValidateResult>(
    "/api/auth/ldap",
    { username, password },
    TIMEOUT_LDAP,
    unavailable<LdapValidateResult>("LDAP no disponible")
  );
}

// ADMSEC.USUARIOS lookup (sin clave).
export function lookupAdmsec(username: string): Promise<AdmsecLookupResult> {
  return postJson<AdmsecLookupResult>(
    "/api/auth/admsec/lookup",
    { username },
    TIMEOUT_ADMSEC,
    unavailable<AdmsecLookupResult>("ADMSEC no disponible")
  );
}

// ADMSEC.USUARIOS validación de clave (Encrypt64).
export function validateAdmsec(username: string, password: string): Promise<AdmsecValidateResult> {
  return postJson<AdmsecValidateResult>(
    "/api/auth/admsec/validate",
    { username, password },
    TIMEOUT_ADMSEC,
    unavailable<AdmsecValidateResult>("ADMSEC no disponible")
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Lookup de datos de agencia (escenario + empresa fletera) sin validar clave.
// Llama a /api/auth/as400/lookup en el AS400 API server.
// Retorna los mismos campos de agencia que validateAs400, pero sin credenciales.
// Si el servicio no está disponible o el endpoint no existe → UNAVAILABLE.
// ──────────────────────────────────────────────────────────────────────────────

export interface As400AgenciaLookupPayload {
  username: string;
  escenarioId?: number | null;
  escenarioNom?: string | null;
  empFleteraId?: number | null;
  empFleteraNom?: string | null;
}

export type As400AgenciaLookupOutcome = "FOUND" | "NOT_FOUND" | "UNAVAILABLE";

export interface As400AgenciaLookupResult {
  outcome: As400AgenciaLookupOutcome;
  data?: As400AgenciaLookupPayload;
  message?: string;
}

export function lookupAs400Agencia(username: string): Promise<As400AgenciaLookupResult> {
  return postJson<As400AgenciaLookupResult>(
    "/api/auth/as400/lookup",
    { username },
    TIMEOUT_AS400,
    unavailable<As400AgenciaLookupResult>("AS400 API no disponible")
  );
}
