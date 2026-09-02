/**
 * El planificador del sync horario ADMSEC → secapi.
 *
 * Función PURA: recibe las filas del origen, el padrón de PG y la marca de la
 * última corrida OK, y devuelve la lista de acciones. No toca base, ni red, ni
 * el AS400 — quien ejecuta las acciones es el job (sección 3.1 de la spec).
 *
 * La regla entera está en la sección 3.3 de
 * docs/superpowers/specs/2026-09-01-sync-usuarios-admsec-design.md.
 */

import { normalizarUsername } from "./comparar";

export type MotivoOmision = "CUENTA_SISTEMA" | "ES_ROOT" | "BAJA_LOCAL";

export type AccionSync =
  | { tipo: "ALTA"; login: string; habilitado: boolean; origen: "LDAP" | "GSIST" }
  | { tipo: "CAMBIO_ESTADO"; usuarioId: number; login: string; de: string; a: string }
  | { tipo: "OMITIDO"; login: string; motivo: MotivoOmision };

/** Una fila de ADMSEC.USUARIOS, ya mapeada. */
export interface FilaOrigenSync {
  /** USULOGIN, en MAYÚSCULAS como lo guarda el AS400. */
  login: string;
  /** USUHABILITADO === 'S'. */
  habilitado: boolean;
  /** USUAUTAD: 'A' → LDAP, cualquier otra cosa → GSIST. */
  autAd: "A" | "G";
  /**
   * USUDTUPD formateada con VARCHAR_FORMAT, ancho fijo de 26. String A
   * PROPÓSITO: ver el comentario de `avanzo` más abajo.
   */
  dtUpd: string | null;
}

/** Lo mínimo que hace falta de la tabla `usuarios` de PG. */
export interface FilaLocalSync {
  id: number;
  username: string;
  estado: string;
  fechaBaja: Date | null;
  /** Sale de `aplicacionesRootDeUsuario` (spec 3.4), no de comparar `= 'Root'`. */
  esRoot: boolean;
}

export interface PlanSync {
  acciones: AccionSync[];
  /**
   * Filas presentes en los dos lados, con el estado divergente, SIN que la
   * marca haya avanzado (spec 6). Se cuentan y se reportan en la nota de la
   * corrida; el job no las toca: la regla que manda es la 3.3.
   */
  divergentesSinMarca: number;
}

// ─── Cuentas de sistema ─────────────────────────────────────────────────────
// Lista PROPIA del job (spec 3.5). No se extiende src/lib/usuarios/cuentasSistema.ts
// a propósito: ese módulo lo consume el wizard del panel para decidir qué viene
// tildado, y agregarle nombres le cambia el comportamiento a la UI.

const NOMBRES_SISTEMA = new Set([
  "AUDITORIA",
  "DAEMONS",
  "DIRECTORIO",
  "DISTRIWEB",
  "FPROLOAUD",
  "GPSONLINE",
  "GRANELWEBONLINE",
  "IGTEST",
  "INCIDENTES",
  "INVITADO",
  "PRODUCCION",
  "PUESTODEMO",
  "PUESTOPRUEBA",
  "ROOT",
  "TALLER",
  "ADMINISTRADOR",
]);

/** PEDWEBADMIN, PEDWEBPISTA, PEDWEBTOMAPED, PEDWEBTPEDCALLE. */
const PREFIJOS_SISTEMA = ["PEDWEB"];

export function esCuentaDeSistemaSync(login: string): boolean {
  const u = normalizarUsername(login);
  if (!u) return false;
  if (NOMBRES_SISTEMA.has(u)) return true;
  return PREFIJOS_SISTEMA.some((p) => u.startsWith(p));
}

// ─── El planificador ────────────────────────────────────────────────────────

export function planificar(
  origen: FilaOrigenSync[],
  local: FilaLocalSync[],
  marca: string | null,
): PlanSync {
  // El match va por normalizarUsername (UPPER + TRIM): el AS400 guarda SACUNA
  // y la PG sacuna. Con match exacto los 14 ya migrados se darían de alta de
  // nuevo y chocarían contra el @unique.
  // Si dos filas locales normalizan igual (el @unique de username en PG es
  // case-sensitive, así que `sacuna` y `SACUNA` pueden convivir), gana la
  // PRIMERA y no la última: pisar dejaría la otra invisible y un cambio de
  // estado podría aplicarse a la fila que no es la que loguea. Hoy no hay
  // ninguna colisión de estas, y si aparece se prefiere ser determinista.
  const padron = new Map<string, FilaLocalSync>();
  for (const l of local) {
    const clave = normalizarUsername(l.username);
    if (!clave || padron.has(clave)) continue;
    padron.set(clave, l);
  }

  const acciones: AccionSync[] = [];
  let divergentesSinMarca = 0;

  for (const fila of origen) {
    // Un USULOGIN en blanco no se da de alta: sin esto, una fila basura del
    // origen termina creando un usuario con `username: ""`. El wizard ya había
    // aprendido esta lección (importar/route.ts, el chequeo de identidad); el
    // job no pasa por ahí, así que la guarda va acá.
    const clave = normalizarUsername(fila.login);
    if (!clave) continue;

    const esperado = fila.habilitado ? "A" : "I";
    const loc = padron.get(clave);

    // ── Regla A: no está en PG → alta ──────────────────────────────────────
    if (!loc) {
      if (esCuentaDeSistemaSync(fila.login)) {
        acciones.push({ tipo: "OMITIDO", login: fila.login, motivo: "CUENTA_SISTEMA" });
        continue;
      }
      acciones.push({
        tipo: "ALTA",
        login: fila.login,
        habilitado: esperado === "A",
        origen: fila.autAd === "A" ? "LDAP" : "GSIST",
      });
      continue;
    }

    // ── Regla B: está en PG → a lo sumo se le cambia el estado ─────────────
    const actual = (loc.estado || "").trim().toUpperCase();
    if (esperado === actual) continue;

    // Los dos son string con el MISMO formato de ancho fijo, y se comparan como
    // texto. Acá NUNCA va un new Date(): node-jt400 devuelve todo con
    // getString(), así que dtUpd es texto; contra un Date la comparación da
    // false SIEMPRE, sin error y sin señal, y la Regla B no se dispara nunca.
    // Es el bug que la spec (2.3) existe para evitar.
    // Va >= y no >: la marca es el arranque de la corrida anterior, y con >
    // se pierde la fila estampada en ese mismo microsegundo. Reprocesar no
    // hace daño porque recién se llegó acá con el estado ya divergente.
    const avanzo = marca !== null && fila.dtUpd !== null && fila.dtUpd >= marca;

    if (!avanzo) {
      divergentesSinMarca++;
      continue;
    }

    // Si allá lo deshabilitan y acá es root, nadie administra secapi y la
    // recuperación es SQL a mano contra producción (spec 3.4).
    if (esperado === "I" && loc.esRoot) {
      acciones.push({ tipo: "OMITIDO", login: fila.login, motivo: "ES_ROOT" });
      continue;
    }
    // fechaBaja es la marca de "esta baja la decidió secapi": el soft-delete no
    // borra los roles, así que reactivar devuelve a la persona con todo puesto.
    if (esperado === "A" && loc.fechaBaja) {
      acciones.push({ tipo: "OMITIDO", login: fila.login, motivo: "BAJA_LOCAL" });
      continue;
    }

    acciones.push({
      tipo: "CAMBIO_ESTADO",
      usuarioId: loc.id,
      login: fila.login,
      de: loc.estado,
      a: esperado,
    });
  }

  return { acciones, divergentesSinMarca };
}
