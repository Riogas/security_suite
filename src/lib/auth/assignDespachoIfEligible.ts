import { prisma } from "@/lib/prisma";
import { authLog } from "./logger";

const DESPACHO_ROL_ID = parseInt(process.env.DESPACHO_ROL_ID || "49", 10);

/**
 * Asigna el rol Despacho a un usuario PG existente cuando:
 *  - validó OK contra LDAP (no fallback)
 *  - viene de desdeSistema = LDAP y esExterno = S
 *  - LDAP indicó isDespacho = true
 *  - no tiene roles previos (no pisamos asignaciones manuales)
 *
 * Mantiene el comportamiento del Escenario B del flujo legacy.
 */
export async function assignDespachoIfEligible(opts: {
  usuario: { id: number; desdeSistema: string | null; esExterno: string | null; username: string };
  ldapResult: { outcome: string; user?: { isDespacho?: boolean } } | null;
}): Promise<void> {
  const { usuario, ldapResult } = opts;

  if (!ldapResult || ldapResult.outcome !== "OK") return;
  if (usuario.desdeSistema?.trim() !== "LDAP") return;
  if (usuario.esExterno?.trim() !== "S") return;
  if (!ldapResult.user?.isDespacho) return;

  const rolesCount = await prisma.usuarioRol.count({ where: { usuarioId: usuario.id } });
  if (rolesCount > 0) return;

  await prisma.usuarioRol
    .upsert({
      where: { usuarioId_rolId: { usuarioId: usuario.id, rolId: DESPACHO_ROL_ID } },
      create: { usuarioId: usuario.id, rolId: DESPACHO_ROL_ID },
      update: {},
    })
    .then(() => {
      authLog.info("rol Despacho asignado (existente LDAP)", {
        username: usuario.username,
        usuarioId: usuario.id,
        rolId: DESPACHO_ROL_ID,
      });
    })
    .catch((err: Error) => {
      authLog.error("no se pudo asignar rol Despacho", {
        username: usuario.username,
        usuarioId: usuario.id,
        rolId: DESPACHO_ROL_ID,
        message: err.message,
      });
    });
}

/**
 * Asigna Despacho durante un alta nueva (caso 1) si la fuente externa lo indicó.
 * Solo asigna si el usuario no tiene roles previos.
 */
export async function assignDespachoOnNewUser(usuarioId: number, username: string, eligible: boolean): Promise<void> {
  if (!eligible) return;
  const rolesCount = await prisma.usuarioRol.count({ where: { usuarioId } });
  if (rolesCount > 0) {
    authLog.info("usuario nuevo ya tenía roles, no asigno Despacho", { username, usuarioId, rolesCount });
    return;
  }
  await prisma.usuarioRol
    .upsert({
      where: { usuarioId_rolId: { usuarioId, rolId: DESPACHO_ROL_ID } },
      create: { usuarioId, rolId: DESPACHO_ROL_ID },
      update: {},
    })
    .then(() => {
      authLog.info("rol Despacho asignado (alta)", { username, usuarioId, rolId: DESPACHO_ROL_ID });
    })
    .catch((err: Error) => {
      authLog.error("no se pudo asignar rol Despacho (alta)", {
        username,
        usuarioId,
        rolId: DESPACHO_ROL_ID,
        message: err.message,
      });
    });
}
