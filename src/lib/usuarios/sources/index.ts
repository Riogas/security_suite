import type { ExternalUser, OrigenExterno } from "../tipos";
import { listarAdmsec, listarLdapAd, listarSgm, type RespuestaLista } from "./as400Users";
import { mapearFilaAdmsec, mapearFilaLdapAd, mapearFilaSgm } from "./mapeo";

export interface Disponibilidad {
  ok: boolean;
  reason?: string;
}

export interface ExternalUserSource {
  key: OrigenExterno;
  label: string;
  available(): Promise<Disponibilidad>;
  list(opts: { soloHabilitados: boolean }): Promise<ExternalUser[]>;
}

/**
 * Helper que lanza un Error si la respuesta no es OK.
 * El mensaje del error incluye reason y error para diagnosticar en el endpoint.
 * El try/catch del endpoint entonces atrapa esto y lo reporta en `fuentes[].reason`.
 */
function validarRespuesta<T>(origen: string, r: RespuestaLista<T>): T[] {
  if (r.ok && r.rows) return r.rows;

  const parts = [origen, r.reason || "UNKNOWN"];
  if (r.error) parts.push(r.error);
  throw new Error(parts.join(": "));
}

/** ¿Hay cuenta de servicio de AD configurada? Es el único switch de §4.2. */
function hayServiceAccountAd(): boolean {
  return Boolean(process.env.LDAP_BIND_USER && process.env.LDAP_BIND_PASSWORD);
}

const sgmSource: ExternalUserSource = {
  key: "SGM",
  label: "SGM (usuarios móviles)",
  async available() {
    const r = await listarSgm(true);
    return r.ok ? { ok: true } : { ok: false, reason: r.reason };
  },
  async list({ soloHabilitados }) {
    const r = await listarSgm(soloHabilitados);
    const rows = validarRespuesta("SGM", r);
    return rows.map(mapearFilaSgm);
  },
};

/**
 * El origen LDAP: hoy sale de ADMSEC filtrando USUAUTAD='A'; cuando exista la
 * cuenta de servicio de AD, sale del AD real.
 *
 * ESTE ES EL ÚNICO LUGAR donde vive esa decisión. El resto de la app no se
 * entera de cuál de los dos caminos se usó.
 *
 * Fallback: Si hay service account de AD y el AD falla, cae a ADMSEC sin lanzar.
 * Solo lanza si ADMSEC también falla.
 */
const ldapSource: ExternalUserSource = {
  key: "LDAP",
  label: "LDAP / Active Directory",
  async available() {
    if (hayServiceAccountAd()) {
      const r = await listarLdapAd(true);
      if (r.ok) return { ok: true };
      // Si el AD falla, caemos a ADMSEC en vez de devolver error.
    }
    const r = await listarAdmsec(true);
    return r.ok
      ? { ok: true, reason: "DESDE_ADMSEC" }
      : { ok: false, reason: r.reason };
  },
  async list({ soloHabilitados }) {
    if (hayServiceAccountAd()) {
      const r = await listarLdapAd(soloHabilitados);
      if (r.ok && r.rows) return r.rows.map(mapearFilaLdapAd);
      // Si el AD falla, caemos a ADMSEC en vez de lanzar.
    }
    const r = await listarAdmsec(soloHabilitados);
    const rows = validarRespuesta("LDAP", r);
    return rows.map(mapearFilaAdmsec).filter((u) => u.origen === "LDAP");
  },
};

const gsistSource: ExternalUserSource = {
  key: "GSIST",
  label: "ADMSEC / GSIST",
  async available() {
    const r = await listarAdmsec(true);
    return r.ok ? { ok: true } : { ok: false, reason: r.reason };
  },
  async list({ soloHabilitados }) {
    const r = await listarAdmsec(soloHabilitados);
    const rows = validarRespuesta("GSIST", r);
    return rows.map(mapearFilaAdmsec).filter((u) => u.origen === "GSIST");
  },
};

const FUENTES: Record<OrigenExterno, ExternalUserSource> = {
  SGM: sgmSource,
  LDAP: ldapSource,
  GSIST: gsistSource,
};

export function obtenerFuente(key: OrigenExterno): ExternalUserSource {
  return FUENTES[key];
}

export function obtenerTodasLasFuentes(): ExternalUserSource[] {
  return [sgmSource, ldapSource, gsistSource];
}
