import { prisma } from "@/lib/prisma";
import { authLog } from "./logger";

/**
 * Mapeo de GRUPOS de ADMSEC.GRPUSU a roles/flags en PG, según política RioGas:
 *   - Grupo 52 (despacho)         → ya lo maneja `assignDespachoIfEligible` (rol 49)
 *   - Grupo 1 (admin total)       → marca `esRoot = 'S'` en `usuarios`
 *   - Grupo 56 o 185 (operador)   → asigna rol 48 en `usuario_roles`
 *   - Grupo 422 (consulta)        → asigna rol 50 en `usuario_roles`
 *
 * Configurable por env vars (defaults arriba):
 *   ADMSEC_GROUP_ROOT       (default 1)
 *   ADMSEC_GROUP_ROL_48     (default "56,185")     # CSV
 *   ADMSEC_GROUP_ROL_50     (default 422)
 *   PG_ROL_OPERADOR_ID      (default 48)
 *   PG_ROL_CONSULTA_ID      (default 50)
 *
 * El helper es idempotente: si el flag/rol ya está, no hace nada. Nunca
 * remueve roles preexistentes — solo agrega los que la política indica.
 */

const GROUP_ROOT = parseInt(process.env.ADMSEC_GROUP_ROOT || "1", 10);
const GROUP_ROL_48 = (process.env.ADMSEC_GROUP_ROL_48 || "56,185")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n));
const GROUP_ROL_50 = parseInt(process.env.ADMSEC_GROUP_ROL_50 || "422", 10);

const ROL_OPERADOR_ID = parseInt(process.env.PG_ROL_OPERADOR_ID || "48", 10);
const ROL_CONSULTA_ID = parseInt(process.env.PG_ROL_CONSULTA_ID || "50", 10);

interface ApplyOpts {
  usuario: { id: number; username: string; esRoot: string | null };
  groups: number[];
}

async function ensureRolAssigned(usuarioId: number, rolId: number, username: string, motivo: string) {
  try {
    await prisma.usuarioRol.upsert({
      where: { usuarioId_rolId: { usuarioId, rolId } },
      create: { usuarioId, rolId },
      update: {},
    });
    authLog.info("rol asignado por grupo ADMSEC", { username, usuarioId, rolId, motivo });
  } catch (err) {
    authLog.error("no se pudo asignar rol por grupo ADMSEC", {
      username,
      usuarioId,
      rolId,
      motivo,
      message: (err as Error).message,
    });
  }
}

export async function applyAdmsecGroupRoles({ usuario, groups }: ApplyOpts): Promise<void> {
  if (!groups || groups.length === 0) return;
  const groupSet = new Set(groups);

  // Grupo 1 → esRoot = 'S' (no toca otros campos del usuario).
  if (groupSet.has(GROUP_ROOT) && usuario.esRoot?.trim() !== "S") {
    try {
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { esRoot: "S" },
      });
      authLog.info("usuario marcado esRoot por grupo ADMSEC", {
        username: usuario.username,
        usuarioId: usuario.id,
        groupId: GROUP_ROOT,
      });
    } catch (err) {
      authLog.error("no se pudo marcar esRoot por grupo ADMSEC", {
        username: usuario.username,
        usuarioId: usuario.id,
        message: (err as Error).message,
      });
    }
  }

  // Grupos 56/185 → rol 48 (operador).
  if (GROUP_ROL_48.some((g) => groupSet.has(g))) {
    await ensureRolAssigned(
      usuario.id,
      ROL_OPERADOR_ID,
      usuario.username,
      `grupos ADMSEC ${GROUP_ROL_48.filter((g) => groupSet.has(g)).join("/")}`
    );
  }

  // Grupo 422 → rol 50 (consulta).
  if (groupSet.has(GROUP_ROL_50)) {
    await ensureRolAssigned(
      usuario.id,
      ROL_CONSULTA_ID,
      usuario.username,
      `grupo ADMSEC ${GROUP_ROL_50}`
    );
  }
}
