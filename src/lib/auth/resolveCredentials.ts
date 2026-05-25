import { prisma } from "@/lib/prisma";
import type { Usuario } from "@prisma/client";
import {
  lookupAdmsec,
  lookupAs400Agencia,
  validateAdmsec,
  validateAs400,
  validateLdap,
} from "./clients/as400Client";
import {
  assignDespachoIfEligible,
  assignDespachoOnNewUser,
} from "./assignDespachoIfEligible";
import { applyAdmsecGroupRoles } from "./applyAdmsecGroupRoles";
import { authLog } from "./logger";
import { persistEscenarioPreference } from "./persistEscenarioPreference";
import { persistEmpFleteraPreference } from "./persistEmpFleteraPreference";
import { upsertExternalUser } from "./upsertExternalUser";
import { classifyUsername } from "./classifyUsername";
import { getApplicableRoles, parseEscenarioFromPref } from "./applyScenarioFilter";
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
  /** GRPIDs del usuario en ADMSEC.GRPUSU (si se obtuvieron). */
  groups: number[];
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

// Un usuario con esRoot='S' (o boolean true si la columna migró a boolean) bypasea
// el chequeo de rol Despacho.
// La validación de credenciales (password contra fuente externa) NO se bypasea.
function isRootUser(usuario: Usuario): boolean {
  return String(usuario.esRoot ?? "").trim().toUpperCase() === "S";
}

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
  // Los grupos los conocemos desde el lookup. El validate los re-trae para
  // evitar TOCTOU si la membresía cambió entre lookup y validate.
  const lookupGroups = lookup.user!.groups || [];

  if (usuAutAd === "A") {
    // Va por LDAP, con fallback a ADMSEC si LDAP está caído / no encuentra.
    const ldap = await validateLdap(username, password);
    if (ldap.outcome === "OK") {
      return {
        ok: true,
        verifiedBy: "ldap",
        desdeSistema: "LDAP",
        isDespacho: !!ldap.user?.isDespacho,
        groups: lookupGroups,
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
        groups: admsec.user?.groups || lookupGroups,
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
      groups: admsec.user?.groups || lookupGroups,
    };
  }
  if (admsec.outcome === "INVALID_CREDS") {
    return { ok: false, reason: "INVALID" };
  }
  authLog.warn("ADMSEC validate no resolvió", { username, outcome: admsec.outcome });
  return { ok: false, reason: "NOT_RESOLVABLE" };
}

// ────────────────────────────────────────────────────────────────────────────
// Helper: refrescar escenario desde USUMOBILE para usuarios LDAP/GSIST externos.
// Usa el endpoint /api/auth/as400/lookup (sin credenciales) para obtener
// escenarioId/escenarioNom del mismo JOIN que la validación SGM.
// Si el usuario no tiene entrada en USUMOBILE devuelve null silenciosamente.
// ────────────────────────────────────────────────────────────────────────────
async function refreshEscenarioForExternal(
  usuarioId: number,
  username: string
): Promise<void> {
  const result = await lookupAs400Agencia(username);
  if (result.outcome === "FOUND" && result.data) {
    await persistEscenarioPreference(
      usuarioId,
      result.data.escenarioId,
      result.data.escenarioNom,
      true, // isExternal — sobreescribir si difiere
    );
  }
  // NOT_FOUND / UNAVAILABLE → silencioso, no rompe el login.
}

// ────────────────────────────────────────────────────────────────────────────
// Helper: aplicar filtro de roles por escenario y devolver el resultado.
// Lee la preferencia de escenario del usuario (post-refresh) y filtra roles.
// Retorna { escenario, applicable, filteredOut, totalAssigned }.
// ────────────────────────────────────────────────────────────────────────────
async function applyScenarioFilterForUser(
  usuarioId: number,
  username: string,
): Promise<{
  escenario: { id: number; nombre: string } | null;
  applicable: Array<{ rolId: number; nombre: string; global: boolean }>;
  filteredOut: Array<{ rolId: number; nombre: string; escenarios: number[] }>;
  totalAssigned: number;
}> {
  const escPref = await prisma.usuarioPreferencia.findFirst({
    where: { usuarioId, atributo: "Escenario" },
  });
  const escenario = parseEscenarioFromPref(escPref?.valor);
  const { applicable, filteredOut, totalAssigned } = await getApplicableRoles(
    usuarioId,
    escenario?.id ?? null,
    username,
  );
  return { escenario, applicable, filteredOut, totalAssigned };
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
  await applyAdmsecGroupRoles({ usuario, groups: branch.groups });
  // Intentar obtener y persistir escenario desde USUMOBILE (sin credenciales).
  await refreshEscenarioForExternal(usuario.id, username);

  const { escenario, applicable, filteredOut, totalAssigned } =
    await applyScenarioFilterForUser(usuario.id, username);

  if (totalAssigned > 0 && applicable.length === 0) {
    authLog.warn("login bloqueado: ningún rol aplica al escenario (nuevo usuario alfa)", {
      username,
      escenario,
      filteredOut,
    });
    return { ok: false, status: 403, outcome: "FORBIDDEN_SCENARIO", message: "No tenés permisos para el escenario actual" };
  }

  return {
    ok: true,
    verifiedBy: branch.verifiedBy,
    usuarioId: usuario.id,
    escenario,
    rolesFilteredOut: filteredOut,
    applicableRolIds: applicable.map((r) => r.rolId),
  };
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
    // Para usuarios SGM: persistir escenario con isExternal=true para habilitar refresh.
    await persistEscenarioPreference(
      usuario.id,
      sgm.user?.escenarioId,
      sgm.user?.escenarioNom,
      true,
    );
    await persistEmpFleteraPreference(usuario.id, sgm.user?.empFleteraId, sgm.user?.empFleteraNom);

    const { escenario, applicable, filteredOut, totalAssigned } =
      await applyScenarioFilterForUser(usuario.id, username);

    if (totalAssigned > 0 && applicable.length === 0) {
      authLog.warn("login bloqueado: ningún rol aplica al escenario (nuevo usuario numérico)", {
        username,
        escenario,
        filteredOut,
      });
      return { ok: false, status: 403, outcome: "FORBIDDEN_SCENARIO", message: "No tenés permisos para el escenario actual" };
    }

    return {
      ok: true,
      verifiedBy: "sgm",
      usuarioId: usuario.id,
      escenario,
      rolesFilteredOut: filteredOut,
      applicableRolIds: applicable.map((r) => r.rolId),
    };
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
  await applyAdmsecGroupRoles({ usuario, groups: branch.groups });
  await refreshEscenarioForExternal(usuario.id, username);

  const { escenario, applicable, filteredOut, totalAssigned } =
    await applyScenarioFilterForUser(usuario.id, username);

  if (totalAssigned > 0 && applicable.length === 0) {
    authLog.warn("login bloqueado: ningún rol aplica al escenario (nuevo usuario numérico fallback)", {
      username,
      escenario,
      filteredOut,
    });
    return { ok: false, status: 403, outcome: "FORBIDDEN_SCENARIO", message: "No tenés permisos para el escenario actual" };
  }

  return {
    ok: true,
    verifiedBy: branch.verifiedBy,
    usuarioId: usuario.id,
    escenario,
    rolesFilteredOut: filteredOut,
    applicableRolIds: applicable.map((r) => r.rolId),
  };
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
    // Usuario interno: no refrescar escenario, no filtrar roles (escenario no aplica).
    const { escenario, applicable, filteredOut, totalAssigned } =
      await applyScenarioFilterForUser(usuario.id, usuario.username);

    if (totalAssigned > 0 && applicable.length === 0) {
      authLog.warn("login bloqueado: ningún rol aplica al escenario (interno)", {
        username: usuario.username,
        escenario,
        filteredOut,
      });
      return { ok: false, status: 403, outcome: "FORBIDDEN_SCENARIO", message: "No tenés permisos para el escenario actual" };
    }

    return {
      ok: true,
      verifiedBy: "local-db",
      usuarioId: usuario.id,
      escenario,
      rolesFilteredOut: filteredOut,
      applicableRolIds: applicable.map((r) => r.rolId),
    };
  }

  const desde = (usuario.desdeSistema || "").trim().toUpperCase();

  if (desde === "SGM") {
    const sgm = await validateAs400(usuario.username, password);
    if (sgm.outcome === "OK") {
      // Para usuarios SGM externos: refresh de escenario desde AS400 (sobreescribir si difiere).
      await persistEscenarioPreference(
        usuario.id,
        sgm.user?.escenarioId,
        sgm.user?.escenarioNom,
        true, // isExternal
      );
      await persistEmpFleteraPreference(usuario.id, sgm.user?.empFleteraId, sgm.user?.empFleteraNom);

      const { escenario, applicable, filteredOut, totalAssigned } =
        await applyScenarioFilterForUser(usuario.id, usuario.username);

      if (totalAssigned > 0 && applicable.length === 0) {
        authLog.warn("login bloqueado: ningún rol aplica al escenario", {
          username: usuario.username,
          escenario,
          filteredOut,
        });
        return { ok: false, status: 403, outcome: "FORBIDDEN_SCENARIO", message: "No tenés permisos para el escenario actual" };
      }

      return {
        ok: true,
        verifiedBy: "sgm",
        usuarioId: usuario.id,
        escenario,
        rolesFilteredOut: filteredOut,
        applicableRolIds: applicable.map((r) => r.rolId),
      };
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
    // Fallback local: aplicar filtro de escenario igualmente.
    const { escenario, applicable, filteredOut, totalAssigned } =
      await applyScenarioFilterForUser(usuario.id, usuario.username);

    if (totalAssigned > 0 && applicable.length === 0) {
      authLog.warn("login bloqueado: ningún rol aplica al escenario (SGM fallback local)", {
        username: usuario.username,
        escenario,
        filteredOut,
      });
      return { ok: false, status: 403, outcome: "FORBIDDEN_SCENARIO", message: "No tenés permisos para el escenario actual" };
    }

    return {
      ok: true,
      verifiedBy: "local-fallback",
      usuarioId: usuario.id,
      escenario,
      rolesFilteredOut: filteredOut,
      applicableRolIds: applicable.map((r) => r.rolId),
    };
  }

  if (desde === "LDAP") {
    const ldap = await validateLdap(usuario.username, password);
    if (ldap.outcome === "OK") {
      // Sin rol Despacho → denegar acceso (LDAP/GSIST exige Despacho), salvo esRoot.
      if (!ldap.user?.isDespacho) {
        if (isRootUser(usuario)) {
          authLog.info("acceso permitido por esRoot, bypass de chequeo Despacho", {
            username: usuario.username,
            verifiedBy: "ldap",
          });
        } else {
          authLog.info("acceso denegado: existing LDAP user sin rol Despacho", {
            username: usuario.username,
          });
          return { ok: false, status: 403, message: ACCESS_DENIED_NOT_DESPACHO };
        }
      }
      // Escenario B: asignar Despacho si corresponde.
      await assignDespachoIfEligible({
        usuario,
        ldapResult: { outcome: ldap.outcome, user: { isDespacho: !!ldap.user?.isDespacho } },
      });
      // Refrescar escenario desde USUMOBILE para usuarios LDAP externos.
      await refreshEscenarioForExternal(usuario.id, usuario.username);

      const { escenario, applicable, filteredOut, totalAssigned } =
        await applyScenarioFilterForUser(usuario.id, usuario.username);

      if (totalAssigned > 0 && applicable.length === 0) {
        authLog.warn("login bloqueado: ningún rol aplica al escenario (LDAP)", {
          username: usuario.username,
          escenario,
          filteredOut,
        });
        return { ok: false, status: 403, outcome: "FORBIDDEN_SCENARIO", message: "No tenés permisos para el escenario actual" };
      }

      return {
        ok: true,
        verifiedBy: "ldap",
        usuarioId: usuario.id,
        escenario,
        rolesFilteredOut: filteredOut,
        applicableRolIds: applicable.map((r) => r.rolId),
      };
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
    const { escenario, applicable, filteredOut, totalAssigned } =
      await applyScenarioFilterForUser(usuario.id, usuario.username);

    if (totalAssigned > 0 && applicable.length === 0) {
      authLog.warn("login bloqueado: ningún rol aplica al escenario (LDAP fallback local)", {
        username: usuario.username,
        escenario,
        filteredOut,
      });
      return { ok: false, status: 403, outcome: "FORBIDDEN_SCENARIO", message: "No tenés permisos para el escenario actual" };
    }

    return {
      ok: true,
      verifiedBy: "local-fallback",
      usuarioId: usuario.id,
      escenario,
      rolesFilteredOut: filteredOut,
      applicableRolIds: aplicableMapear(applicable),
    };
  }

  if (desde === "GSIST") {
    // Misma lógica que el subárbol ADMSEC del caso 1.
    const branch = await validateAgainstAdmsec(usuario.username, password);
    if (branch.ok) {
      // Sin rol Despacho → denegar acceso (LDAP/GSIST exige Despacho), salvo esRoot.
      if (!branch.isDespacho) {
        if (isRootUser(usuario)) {
          authLog.info("acceso permitido por esRoot, bypass de chequeo Despacho", {
            username: usuario.username,
            verifiedBy: branch.verifiedBy,
          });
        } else {
          authLog.info("acceso denegado: existing GSIST/LDAP user sin rol Despacho", {
            username: usuario.username,
            verifiedBy: branch.verifiedBy,
          });
          return { ok: false, status: 403, message: ACCESS_DENIED_NOT_DESPACHO };
        }
      }
      // Si validó por LDAP, también puede aplicar Escenario B.
      if (branch.verifiedBy === "ldap" && branch.ldapResult) {
        await assignDespachoIfEligible({ usuario, ldapResult: branch.ldapResult });
      }
      // Aplicar reglas de grupo ADMSEC (root, rol 48, rol 50) según política.
      await applyAdmsecGroupRoles({ usuario, groups: branch.groups });
      // Refrescar escenario desde USUMOBILE para usuarios GSIST externos.
      await refreshEscenarioForExternal(usuario.id, usuario.username);

      const { escenario, applicable, filteredOut, totalAssigned } =
        await applyScenarioFilterForUser(usuario.id, usuario.username);

      if (totalAssigned > 0 && applicable.length === 0) {
        authLog.warn("login bloqueado: ningún rol aplica al escenario (GSIST)", {
          username: usuario.username,
          escenario,
          filteredOut,
        });
        return { ok: false, status: 403, outcome: "FORBIDDEN_SCENARIO", message: "No tenés permisos para el escenario actual" };
      }

      return {
        ok: true,
        verifiedBy: branch.verifiedBy,
        usuarioId: usuario.id,
        escenario,
        rolesFilteredOut: filteredOut,
        applicableRolIds: applicable.map((r) => r.rolId),
      };
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
    const { escenario, applicable, filteredOut, totalAssigned } =
      await applyScenarioFilterForUser(usuario.id, usuario.username);

    if (totalAssigned > 0 && applicable.length === 0) {
      authLog.warn("login bloqueado: ningún rol aplica al escenario (GSIST fallback local)", {
        username: usuario.username,
        escenario,
        filteredOut,
      });
      return { ok: false, status: 403, outcome: "FORBIDDEN_SCENARIO", message: "No tenés permisos para el escenario actual" };
    }

    return {
      ok: true,
      verifiedBy: "local-fallback",
      usuarioId: usuario.id,
      escenario,
      rolesFilteredOut: filteredOut,
      applicableRolIds: applicable.map((r) => r.rolId),
    };
  }

  // desdeSistema desconocido en un externo → estado inconsistente.
  authLog.error("usuario externo con desdeSistema desconocido", {
    username: usuario.username,
    desdeSistema: usuario.desdeSistema,
  });
  return { ok: false, status: 500, message: "Configuración de usuario inválida" };
}

// Pequeño helper de alias para el path LDAP fallback (evita typo al cerrar la rama).
function aplicableMapear(applicable: Array<{ rolId: number }>): number[] {
  return applicable.map((r) => r.rolId);
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
