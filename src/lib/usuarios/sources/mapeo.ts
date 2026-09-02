import { esCuentaSistema } from "../cuentasSistema";
import type { ExternalUser } from "../tipos";

// Las claves cortas (L, N, E, HAB...) son los alias de las queries del
// as400-api. DB2 devuelve los nombres de columna en mayúsculas, y los alias
// cortos evitan tener que escribir USUMOBILEHABILITADO en todos lados.

export interface FilaSgm {
  /** USUMOBILELOGIN */
  L: string;
  /** USUMOBILENOMBRE */
  N?: string | null;
  /** USUMOBILEEMAIL */
  E?: string | null;
  /** USUMOBILEHABILITADO */
  HAB?: string | null;
  /** ESCENARIO.ESCENARIOID */
  ESCID?: number | string | null;
  /** ESCENARIO.ESCENARIONOM */
  ESCNOM?: string | null;
  /** AGENCIA.AGENCIAVINCEMPFLT */
  EFLID?: number | string | null;
  /** EFLETERA.EFLNOM */
  EFLNOM?: string | null;
  /** USUMOBILEROLES.USUMOBR_ROLID */
  ROLES?: number[];
}

export interface FilaAdmsec {
  /** USUID */
  ID?: number | string | null;
  /** USULOGIN */
  L: string;
  /** USUHABILITADO */
  HAB?: string | null;
  /** USUAUTAD */
  AUTAD?: string | null;
  /**
   * USUDTUPD ya formateada por VARCHAR_FORMAT como 'YYYY-MM-DD HH24:MI:SS.FF6'.
   * Es un string A PROPÓSITO y nunca hay que convertirlo a Date: node-jt400
   * devuelve todo como texto, y compararlo contra un Date da false siempre.
   */
  DTUPD?: string | null;
  /** GRPIDs de ADMSEC.GRPUSU */
  GRUPOS?: number[];
}

export interface FilaLdapAd {
  sAMAccountName: string;
  displayName?: string | null;
  mail?: string | null;
  /** Active Directory: userAccountControl bit 2 = cuenta deshabilitada. */
  deshabilitada?: boolean;
}

function texto(v: string | null | undefined): string | null {
  const s = (v || "").trim();
  return s || null;
}

function habilitado(v: string | null | undefined): boolean {
  return (v || "").trim().toUpperCase() === "S";
}

function entero(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function mapearFilaSgm(row: FilaSgm): ExternalUser {
  const username = (row.L || "").trim();
  // AGENCIAVINCEMPFLT en 0 o null significa "sin fletera vinculada", no la
  // fletera con id 0. Mismo criterio que mapAgenciaFields en auth.js.
  const eflId = entero(row.EFLID);
  const empFleteraId = eflId != null && eflId > 0 ? eflId : null;

  return {
    origen: "SGM",
    username,
    nombre: texto(row.N),
    email: texto(row.E),
    habilitado: habilitado(row.HAB),
    esCuentaSistema: esCuentaSistema(username),
    extras: {
      escenarioId: entero(row.ESCID),
      escenarioNom: texto(row.ESCNOM),
      empFleteraId,
      empFleteraNom: empFleteraId != null ? texto(row.EFLNOM) : null,
      rolesSgm: row.ROLES ?? [],
    },
  };
}

export function mapearFilaAdmsec(row: FilaAdmsec): ExternalUser {
  const username = (row.L || "").trim();
  // Cualquier valor que no sea 'A' se trata como 'G'. Es el criterio de
  // normalizeAutAd en as400-api/src/routes/auth-admsec.js: más seguro,
  // evita mandar a alguien a LDAP por un dato sucio.
  const usuAutAd = (row.AUTAD || "").trim().toUpperCase() === "A" ? "A" : "G";

  return {
    origen: usuAutAd === "A" ? "LDAP" : "GSIST",
    username,
    // ADMSEC.USUARIOS no tiene columna de nombre ni de email. El nombre lo
    // completa el backfill del login contra AD (ver la spec, §6).
    nombre: null,
    email: null,
    habilitado: habilitado(row.HAB),
    esCuentaSistema: esCuentaSistema(username),
    extras: {
      grupos: row.GRUPOS ?? [],
      usuAutAd,
      usuId: entero(row.ID),
      dtUpd: texto(row.DTUPD),
    },
  };
}

export function mapearFilaLdapAd(row: FilaLdapAd): ExternalUser {
  const username = (row.sAMAccountName || "").trim();
  return {
    origen: "LDAP",
    username,
    nombre: texto(row.displayName),
    email: texto(row.mail),
    habilitado: !row.deshabilitada,
    esCuentaSistema: esCuentaSistema(username),
    extras: { usuAutAd: "A" },
  };
}
