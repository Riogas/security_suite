import type {
  DiferenciaCampo,
  ExternalUser,
  ExternalUserComparado,
  ResumenComparacion,
  UsuarioLocalMinimo,
} from "./tipos";

/**
 * Clave de match entre un usuario externo y uno local.
 *
 * Va en MAYÚSCULAS y sin espacios a propósito: el @unique de `username` en
 * PostgreSQL es case-sensitive, pero el AS400 guarda los logins en mayúsculas
 * (SACUNA) y la PG en minúsculas (sacuna). Con match exacto, los 14 usuarios
 * de ADMSEC que YA están migrados se clasificarían como NUEVO y el import
 * crearía 14 duplicados. El login ya busca case-insensitive
 * (resolveCredentials.ts:641), así que esto es consistente con él.
 */
export function normalizarUsername(s: string): string {
  return (s || "").trim().toUpperCase();
}

function normalizarEmail(s: string | null | undefined): string | null {
  const v = (s || "").trim().toLowerCase();
  return v || null;
}

/** El nombre local se arma con nombre + apellido; el externo viene entero. */
function nombreCompletoLocal(u: UsuarioLocalMinimo): string | null {
  const v = [u.nombre, u.apellido].filter(Boolean).join(" ").trim();
  return v || null;
}

function calcularDiffs(ext: ExternalUser, loc: UsuarioLocalMinimo): DiferenciaCampo[] {
  const diffs: DiferenciaCampo[] = [];

  // Un externo sin dato NO es una diferencia: ADMSEC no tiene nombre ni email,
  // y marcar DIFIERE por eso ensuciaría los 326 de LDAP con ruido inútil.
  const extNombre = (ext.nombre || "").trim() || null;
  if (extNombre !== null) {
    const locNombre = nombreCompletoLocal(loc);
    if (extNombre !== locNombre) {
      diffs.push({ campo: "nombre", local: locNombre, externo: extNombre });
    }
  }

  const extEmail = normalizarEmail(ext.email);
  if (extEmail !== null) {
    const locEmail = normalizarEmail(loc.email);
    if (extEmail !== locEmail) {
      diffs.push({ campo: "email", local: locEmail, externo: extEmail });
    }
  }

  const extEstado = ext.habilitado ? "A" : "I";
  const locEstado = (loc.estado || "").trim().toUpperCase() === "A" ? "A" : "I";
  if (extEstado !== locEstado) {
    diffs.push({ campo: "estado", local: locEstado, externo: extEstado });
  }

  return diffs;
}

/**
 * Cruza la lista de una fuente externa contra las filas de `usuarios` en PG.
 *
 * Devuelve TODAS las filas externas clasificadas — no filtra. El filtrado, el
 * orden y la paginación los hace el endpoint, sobre este resultado.
 */
export function compararUsuarios(
  externos: ExternalUser[],
  locales: UsuarioLocalMinimo[],
): ExternalUserComparado[] {
  const porUsername = new Map<string, UsuarioLocalMinimo>();
  const porEmail = new Map<string, UsuarioLocalMinimo>();

  for (const u of locales) {
    porUsername.set(normalizarUsername(u.username), u);
    const mail = normalizarEmail(u.email);
    // El primero gana: si hubiera dos locales con el mismo mail, la PG ya
    // estaría violando su propio @unique.
    if (mail && !porEmail.has(mail)) porEmail.set(mail, u);
  }

  return externos.map((ext) => {
    const clave = normalizarUsername(ext.username);
    const local = porUsername.get(clave) ?? null;

    // CONFLICTO primero: si el email del externo lo tiene OTRO username local,
    // el insert violaría el @unique de email. Gana sobre cualquier otro estado
    // porque es lo único que hace fallar la escritura.
    const mail = normalizarEmail(ext.email);
    const duenoDelMail = mail ? porEmail.get(mail) ?? null : null;
    if (duenoDelMail && normalizarUsername(duenoDelMail.username) !== clave) {
      return {
        ...ext,
        estadoComparacion: "CONFLICTO" as const,
        usuarioLocalId: local?.id ?? null,
        diffs: [],
        conflictoCon: duenoDelMail.username,
        preseleccionado: false,
      };
    }

    if (!local) {
      return {
        ...ext,
        estadoComparacion: "NUEVO" as const,
        usuarioLocalId: null,
        diffs: [],
        conflictoCon: null,
        // Las cuentas de sistema se ven pero no vienen tildadas, y lo mismo
        // para los deshabilitados: "Incluir deshabilitados" es un toggle de
        // VISIBILIDAD (ver la población completa del origen), no un atajo
        // para tildar de más. Sin el `&& ext.habilitado`, prender ese switch
        // en ADMSEC pasa de ~349 NUEVO a ~1.105, casi todos preseleccionados,
        // y un solo "Importar" los crea a todos en una base compartida con
        // producción sin deshacer masivo posible.
        preseleccionado: !ext.esCuentaSistema && ext.habilitado,
      };
    }

    const diffs = calcularDiffs(ext, local);
    return {
      ...ext,
      estadoComparacion: diffs.length > 0 ? ("DIFIERE" as const) : ("MIGRADO" as const),
      usuarioLocalId: local.id,
      diffs,
      conflictoCon: null,
      // Nunca: el import solo crea (D4).
      preseleccionado: false,
    };
  });
}

export function resumir(comparados: ExternalUserComparado[]): ResumenComparacion {
  const r: ResumenComparacion = {
    nuevos: 0,
    migrados: 0,
    difieren: 0,
    conflictos: 0,
    preseleccionados: 0,
  };
  for (const c of comparados) {
    if (c.estadoComparacion === "NUEVO") r.nuevos++;
    else if (c.estadoComparacion === "MIGRADO") r.migrados++;
    else if (c.estadoComparacion === "DIFIERE") r.difieren++;
    else r.conflictos++;
    if (c.preseleccionado) r.preseleccionados++;
  }
  return r;
}
