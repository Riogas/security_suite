// Tipos compartidos del flujo de autenticación.

export type UsernameType = "alpha" | "numeric" | "invalid";

export type ExternalSource = "SGM" | "GSIST" | "LDAP";

// Cómo se verificó la clave del usuario en el último login. Usado en logs y en la respuesta.
export type VerifiedBy =
  | "local-db"
  | "sgm"
  | "gsist"
  | "gsist-fallback"
  | "ldap"
  | "local-fallback";

// Outcomes de un nodo de validación. Discriminan fallback vs 401 directo.
export type ValidateOutcome =
  | "OK"
  | "INVALID_CREDS"
  | "NOT_FOUND"
  | "DISABLED"
  | "UNAVAILABLE";

export type LookupOutcome = "FOUND" | "NOT_FOUND" | "DISABLED" | "UNAVAILABLE";

// Forma del usuario AS400/USUMOBILE devuelto por /api/auth/as400.
//
// escenarioId / escenarioNom: vienen del JOIN
//   USUMOBILE -> AGENCIA -> ESCENARIO en GXICAGEO.
// Se persisten como preferencia "Escenario" del usuario para alimentar al
// front (TrackMovil, etc.). Si el usuario no tiene agencia / escenario
// asignado en SGM, ambos llegan en null y la preferencia no se persiste.
export interface As400UserPayload {
  username: string;
  nombre: string;
  email: string;
  hasRoleDespacho: boolean;
  escenarioId?: number | null;
  escenarioNom?: string | null;
}

export interface As400ValidateResult {
  outcome: ValidateOutcome;
  user?: As400UserPayload;
  message?: string;
}

// Forma del usuario LDAP devuelto por /api/auth/ldap.
export interface LdapUserPayload {
  username: string;
  nombre: string;
  email: string;
  department?: string;
  title?: string;
  groups?: string[];
  isDespacho: boolean;
}

export interface LdapValidateResult {
  outcome: ValidateOutcome;
  user?: LdapUserPayload;
  message?: string;
}

// ADMSEC lookup (solo metadatos, sin clave).
export interface AdmsecLookupUser {
  username: string;
  usuAutAd: "A" | "G";
  isDespacho: boolean;
}

export interface AdmsecLookupResult {
  outcome: LookupOutcome;
  user?: AdmsecLookupUser;
  message?: string;
}

export interface AdmsecValidateUser {
  username: string;
  isDespacho: boolean;
}

export interface AdmsecValidateResult {
  outcome: ValidateOutcome;
  user?: AdmsecValidateUser;
  message?: string;
}

// Resultado interno del orquestador. Mapea 1:1 con la respuesta HTTP.
export type ResolveResult =
  | {
      ok: true;
      verifiedBy: VerifiedBy;
      // Si el usuario fue creado/actualizado durante el flujo, viene la fila de PG.
      // Si ya existía, también viene la fila (post-upsert eventual).
      usuarioId: number;
    }
  | {
      ok: false;
      status: 400 | 401 | 403 | 500;
      message?: string;
    };
