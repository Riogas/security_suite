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
