import { prisma } from "@/lib/prisma";
import type { Usuario } from "@prisma/client";
import {
  lookupAdmsec,
  validateAdmsec,
  validateAs400,
  validateLdap,
} from "./clients/as400Client";
import {
  assignDespachoIfEligible,
  assignDespachoOnNewUser,
} from "./assignDespachoIfEligible";
import { authLog } from "./logger";
import { persistEscenarioPreference } from "./persistEscenarioPreference";
import { upsertExternalUser } from "./upsertExternalUser";
import { classifyUsername } from "./classifyUsername";
import type {
  AdmsecLookupResult,
  ResolveResult,
  VerifiedBy,
} from "./types";

// ────────────────────────────────────────────────────────────────────────────
// Subárbol reusable: validar contra ADMSEC siguiendo UsuAutAD ('A' = LDAP, 'G' = ADMSEC).
// Se invoca tanto desde el flujo alfa como desde el numérico (cuando USUMOBILE no encontró).
// Si el lookup ya se hizo, pasalo como `lookup` para evitar la doble llamada.
// ────────────────────────────────────────────────────────────────────────────

interface AdmsecBranchSuccess {
  ok: true;
  verifiedBy: Extract<VerifiedBy, "ldap" | "gsist" | "gsist-fallback">;
  desdeSistema: "LDAP" | "GSIST";
  isDespacho: boolean;
  // Para alta: nombre/email del LDAP si se obtuvieron.
  ldapNombre?: string;
  ldapEmail?: string;
  // Resultado bruto LDAP (si pasó por LDAP) — necesario para Escenario B en caso 2.
  ldapResult?: { outcome: string; user?: { isDespacho?: boolean } };
}

interface AdmsecBranchFailure {
  ok: false;
  // 'INVALID' = clave incorrecta confirmada por una fuente → 401 directo.
  // 'NOT_RESOLVABLE' = ningún nodo pudo confirmar → seguir fallbackeando o 401 final.
  reason: "INVALID" | "NOT_RESOLVABLE";
}

type AdmsecBranchResult = AdmsecBranchSuccess | AdmsecBranchFailure;

// Mensaje único para usuarios que validaron contra GSIST o LDAP pero no tienen
// el rol Despacho en SGM (consultado vía AS400 ADMSEC.GRPUSU). Para SGM users
// (USUMOBILE) este chequeo NO aplica — los validamos por escenario / empresa
// fletera más abajo en el flujo.
const ACCESS_DENIED_NOT_DESPACHO = "No tiene acceso a este sistema";

async function validateAgainstAdmsec(
  username: string,
  password: string,
  preLookup?: AdmsecLookupResult
): Promise<AdmsecBranchResult> {
  const lookup = preLookup ?? (await lookupAdmsec(username));

  if (lookup.outcome === "UNAVAILABLE") {
    authLog.warn("ADMSEC lookup UNAVAILABLE", { username });
    return { ok: false, reason: "NOT_RESOLVABLE" };
  }
  if (lookup.outcome === "DISABLED") {
    authLog.info("ADMSEC usuario deshabilitado", { username });
    return { ok: false, reason: "NOT_RESOLVABLE" };
  }
  if (lookup.outcome === "NOT_FOUND") {
    return { ok: false, reason: "NOT_RESOLVABLE" };
  }

  // FOUND
  const usuAutAd = lookup.user!.usuAutAd;

  if (usuAutAd === "A") {
    // Va por LDAP, con fallback a ADMSEC si LDAP está caído / no encuentra.
    const ldap = await validateLdap(username, password);
    if (ldap.outcome === "OK") {
      return {
        ok: true,
        verifiedBy: "ldap",
        desdeSistema: "LDAP",
        isDespacho: !!ldap.user?.isDespacho,
        ldapNombre: ldap.user?.nombre,
        ldapEmail: ldap.user?.email,
        ldapResult: { outcome: ldap.outcome, user: { isDespacho: !!ldap.user?.isDespacho } },
      };
    }
    if (ldap.outcome === "INVALID_CREDS") {
      // Clave confirmada inválida por LDAP → 401 directo, NO fallback.
      authLog.info("LDAP INVALID_CREDS, sin fallback", { username });
      return { ok: false, reason: "INVALID" };
    }
    // NOT_FOUND o UNAVAILABLE → fallback a ADMSEC.
    authLog.warn("LDAP no resolvió, fallback a ADMSEC", { username, outcome: ldap.outcome });
    const admsec = await validateAdmsec(username, password);
    if (admsec.outcome === "OK") {
      return {
        ok: true,
        verifiedBy: "gsist-fallback",
        desdeSistema: "GSIST",
        isDespacho: !!admsec.user?.isDespacho,
      };
    }
    if (admsec.outcome === "INVALID_CREDS") {
      return { ok: false, reason: "INVALID" };
    }
    authLog.warn("ADMSEC fallback no resolvió", { username, outcome: admsec.outcome });
    return { ok: false, reason: "NOT_RESOLVABLE" };
  }

  // UsuAutAD = 'G' (o cualquier valor no reconocido, normalizado a 'G' por la API).
  const admsec = await validateAdmsec(username, password);
  if (admsec.outcome === "OK") {
    return {
      ok: true,
      verifiedBy: "gsist",
      desdeSistema: "GSIST",
      isDespacho: !!admsec.user?.isDespacho,
    };
  }
  if (admsec.outcome === "INVALID_CREDS") {
    return { ok: false, reason: "INVALID" };
  }
  authLog.warn("ADMSEC validate no resolvió", { username, outcome: admsec.outcome });
  return { ok: false, reason: "NOT_RESOLVABLE" };
}

// ────────────────────────────────────────────────────────────────────────────
// Caso 1: usuario NO existe en PG → resolver según tipo (alfa vs numérico).
// ────────────────────────────────────────────────────────────────────────────

async function resolveNewAlphaUser(
  username: string,
  password: string
): Promise<ResolveResult> {
  authLog.info("caso 1 alfa: lookup ADMSEC", { username });
  const branch = await validateAgainstAdmsec(username, password);
  if (!branch.ok) {
    return { ok: false, status: 401 };
  }

  // Sin rol Despacho → denegar acceso (sin crear el user en PG).
  // Aplica solo a validación contra LDAP/GSIST. SGM tiene su propio chequeo.
  if (!branch.isDespacho) {
    authLog.info("alta cancelada: usuario LDAP/GSIST sin rol Despacho", {
      username,
      verifiedBy: branch.verifiedBy,
    });
    return { ok: false, status: 403, message: ACCESS_DENIED_NOT_DESPACHO };
  }

  const usuario = await upsertExternalUser({
    username,
    nombre: branch.ldapNombre || username,
    email: branch.ldapEmail || "",
    password,
    desdeSistema: branch.desdeSistema,
  });
  await assignDespachoOnNewUser(usuario.id, username, branch.isDespacho);
  return { ok: true, verifiedBy: branch.verifiedBy, usuarioId: usuario.id };
}

async function resolveNewNumericUser(
  username: string,
  password: string
): Promise<ResolveResult> {
  authLog.info("caso 1 numérico: validar USUMOBILE", { username });
  const sgm = await validateAs400(username, password);

  if (sgm.outcome === "OK") {
    const usuario = await upsertExternalUser({
      username,
      nombre: sgm.user?.nombre || username,
      email: sgm.user?.email || "",
      password,
      desdeSistema: "SGM",
    });
    await assignDespachoOnNewUser(usuario.id, username, !!sgm.user?.hasRoleDespacho);
    // Persistir el escenario asignado al user en SGM como preferencia.
    // No bloquea el login si falla (helper loguea y no propaga).
    await persistEscenarioPreference(usuario.id, sgm.user?.escenarioId, sgm.user?.escenarioNom);
    return { ok: true, verifiedBy: "sgm", usuarioId: usuario.id };
  }

  if (sgm.outcome === "INVALID_CREDS") {
    authLog.info("USUMOBILE INVALID_CREDS, sin fallback", { username });
    return { ok: false, status: 401 };
  }

  // NOT_FOUND, DISABLED o UNAVAILABLE → degradar a ADMSEC.
  authLog.warn("USUMOBILE no resolvió, fallback a ADMSEC", { username, outcome: sgm.outcome });
  const branch = await validateAgainstAdmsec(username, password);
  if (!branch.ok) {
    return { ok: false, status: 401 };
  }

  // Misma regla que para alfa nuevo: sin Despacho desde LDAP/GSIST → 403.
  if (!branch.isDespacho) {
    authLog.info("alta numerica cancelada: fallback LDAP/GSIST sin rol Despacho", {
      username,
      verifiedBy: branch.verifiedBy,
    });
    return { ok: false, status: 403, message: ACCESS_DENIED_NOT_DESPACHO };
  }

  const usuario = await upsertExternalUser({
    username,
    nombre: branch.ldapNombre || username,
    email: branch.ldapEmail || "",
    password,
    desdeSistema: branch.desdeSistema,
  });
  await assignDespachoOnNewUser(usuario.id, username, branch.isDespacho);
  return { ok: true, verifiedBy: branch.verifiedBy, usuarioId: usuario.id };
}

// ────────────────────────────────────────────────────────────────────────────
// Caso 2: usuario ya existe en PG → routea según esExterno + desdeSistema.
// ────────────────────────────────────────────────────────────────────────────

async function resolveExistingUser(
  usuario: Usuario,
  password: string
): Promise<ResolveResult> {
  if (usuario.estado === "I") {
    return { ok: false, status: 403, message: "Usuario inactivo" };
  }

  // Externo flag = 'N' → validación local directa.
  if ((usuario.esExterno || "").trim() !== "S") {
    if (usuario.password !== password) {
      return { ok: false, status: 401 };
    }
    return { ok: true, verifiedBy: "local-db", usuarioId: usuario.id };
  }

  const desde = (usuario.desdeSistema || "").trim().toUpperCase();

  if (desde === "SGM") {
    const sgm = await validateAs400(usuario.username, password);
    if (sgm.outcome === "OK") {
      // Refrescar el escenario en cada login OK contra SGM. El helper hace
      // delete+create de la preferencia 'Escenario'. Si SGM no devuelve
      // escenario (agencia null) no toca la preferencia existente.
      await persistEscenarioPreference(usuario.id, sgm.user?.escenarioId, sgm.user?.escenarioNom);
      return { ok: true, verifiedBy: "sgm", usuarioId: usuario.id };
    }
    if (sgm.outcome === "INVALID_CREDS") {
      return { ok: false, status: 401 };
    }
    // NOT_FOUND / DISABLED / UNAVAILABLE → fallback a clave PG.
    authLog.warn("SGM no resolvió para usuario existente, fallback a PG", {
      username: usuario.username,
      outcome: sgm.outcome,
    });
    if (usuario.password !== password) {
      return { ok: false, status: 401 };
    }
    return { ok: true, verifiedBy: "local-fallback", usuarioId: usuario.id };
  }

  if (desde === "LDAP") {
    const ldap = await validateLdap(usuario.username, password);
    if (ldap.outcome === "OK") {
      // Sin rol Despacho → denegar acceso (LDAP/GSIST exige Despacho).
      if (!ldap.user?.isDespacho) {
        authLog.info("acceso denegado: existing LDAP user sin rol Despacho", {
          username: usuario.username,
        });
        return { ok: false, status: 403, message: ACCESS_DENIED_NOT_DESPACHO };
      }
      // Escenario B: asignar Despacho si corresponde.
      await assignDespachoIfEligible({
        usuario,
        ldapResult: { outcome: ldap.outcome, user: { isDespacho: !!ldap.user?.isDespacho } },
      });
      return { ok: true, verifiedBy: "ldap", usuarioId: usuario.id };
    }
    if (ldap.outcome === "INVALID_CREDS") {
      return { ok: false, status: 401 };
    }
    // NOT_FOUND / UNAVAILABLE → fallback a PG.
    authLog.warn("LDAP no resolvió para usuario existente, fallback a PG", {
      username: usuario.username,
      outcome: ldap.outcome,
    });
    if (usuario.password !== password) {
      return { ok: false, status: 401 };
    }
    return { ok: true, verifiedBy: "local-fallback", usuarioId: usuario.id };
  }

  if (desde === "GSIST") {
    // Misma lógica que el subárbol ADMSEC del caso 1.
    const branch = await validateAgainstAdmsec(usuario.username, password);
    if (branch.ok) {
      // Sin rol Despacho → denegar acceso (LDAP/GSIST exige Despacho).
      if (!branch.isDespacho) {
        authLog.info("acceso denegado: existing GSIST/LDAP user sin rol Despacho", {
          username: usuario.username,
          verifiedBy: branch.verifiedBy,
        });
        return { ok: false, status: 403, message: ACCESS_DENIED_NOT_DESPACHO };
      }
      // Si validó por LDAP, también puede aplicar Escenario B.
      if (branch.verifiedBy === "ldap" && branch.ldapResult) {
        await assignDespachoIfEligible({ usuario, ldapResult: branch.ldapResult });
      }
      return { ok: true, verifiedBy: branch.verifiedBy, usuarioId: usuario.id };
    }
    if (branch.reason === "INVALID") {
      return { ok: false, status: 401 };
    }
    // NOT_RESOLVABLE → fallback a PG.
    authLog.warn("GSIST no resolvió para usuario existente, fallback a PG", {
      username: usuario.username,
    });
    if (usuario.password !== password) {
      return { ok: false, status: 401 };
    }
    return { ok: true, verifiedBy: "local-fallback", usuarioId: usuario.id };
  }

  // desdeSistema desconocido en un externo → estado inconsistente.
  authLog.error("usuario externo con desdeSistema desconocido", {
    username: usuario.username,
    desdeSistema: usuario.desdeSistema,
  });
  return { ok: false, status: 500, message: "Configuración de usuario inválida" };
}

// ────────────────────────────────────────────────────────────────────────────
// Punto de entrada del orquestador.
// ────────────────────────────────────────────────────────────────────────────

export async function resolveCredentials(
  rawUsername: string,
  rawPassword: string
): Promise<ResolveResult> {
  const username = (rawUsername || "").trim();
  const password = (rawPassword || "").trim();

  if (!username || !password) {
    return { ok: false, status: 400, message: "UserName y Password son requeridos" };
  }

  const tipo = classifyUsername(username);
  if (tipo === "invalid") {
    return { ok: false, status: 401 };
  }

  // Lookup PG case-insensitive.
  const usuarioPg = await prisma.usuario.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
  });

  if (usuarioPg) {
    authLog.info("usuario existe en PG", {
      username: usuarioPg.username,
      estado: usuarioPg.estado,
      esExterno: usuarioPg.esExterno,
      desdeSistema: usuarioPg.desdeSistema,
    });
    return resolveExistingUser(usuarioPg, password);
  }

  authLog.info("usuario no existe en PG", { username, tipo });
  return tipo === "alpha"
    ? resolveNewAlphaUser(username, password)
    : resolveNewNumericUser(username, password);
}
