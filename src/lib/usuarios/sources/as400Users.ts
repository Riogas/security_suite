import type { FilaAdmsec, FilaLdapAd, FilaSgm } from "./mapeo";

const AS400_API_URL = process.env.AS400_API_URL || "";
const USERS_API_KEY = process.env.USERS_API_KEY || "";
const TIMEOUT = 60_000; // enumerar ~1.000 filas del AS400 es lento

export interface RespuestaLista<T> {
  ok: boolean;
  rows?: T[];
  reason?: string;
  error?: string;
}

async function postLista<T>(path: string, body: unknown): Promise<RespuestaLista<T>> {
  if (!AS400_API_URL) return { ok: false, reason: "SIN_AS400_API_URL" };
  if (!USERS_API_KEY) return { ok: false, reason: "SIN_USERS_API_KEY" };

  try {
    const res = await fetch(`${AS400_API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": USERS_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const json = (await res.json()) as RespuestaLista<T>;
    if (!res.ok) return { ok: false, reason: json.reason || `HTTP_${res.status}`, error: json.error };
    return json;
  } catch (e) {
    return { ok: false, reason: "UNAVAILABLE", error: (e as Error).message };
  }
}

export const listarSgm = (soloHabilitados: boolean) =>
  postLista<FilaSgm>("/api/users/sgm/list", { soloHabilitados });

export const listarAdmsec = (soloHabilitados: boolean) =>
  postLista<FilaAdmsec>("/api/users/admsec/list", { soloHabilitados });

export const listarLdapAd = (soloHabilitados: boolean) =>
  postLista<FilaLdapAd>("/api/users/ldap/list", { soloHabilitados });
