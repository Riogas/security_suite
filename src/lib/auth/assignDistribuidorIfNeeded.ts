import { prisma } from "@/lib/prisma";
import { authLog } from "./logger";

/**
 * Asigna el rol `Distribuidor` a un usuario cuando tiene el rol `FWL_Distribuidor`
 * activo (i.e. existe en `usuario_roles` vinculado a un `Rol` con estado='A').
 *
 * Reglas:
 *   - Usuario tiene `FWL_Distribuidor` activo Y NO tiene `Distribuidor` →
 *     crear registro en `usuario_roles` para `Distribuidor`.
 *   - Usuario ya tiene ambos → no-op (idempotente).
 *   - Usuario NO tiene `FWL_Distribuidor` → no-op (no afecta `Distribuidor`).
 *
 * Edge cases:
 *   - `Distribuidor` no existe en tabla `rol` → log warn, no romper login.
 *   - Múltiples filas para `FWL_Distribuidor` con distintos estados → solo
 *     considera las activas (rol.estado = 'A').
 *
 * Se invoca en el flujo de login DESPUÉS de resolveCredentials y ANTES de
 * buildSuccessResponse, para que la respuesta de éxito ya incluya el rol
 * recién asignado.
 *
 * El helper loguea errores pero no los propaga — la falla no debe interrumpir
 * el login.
 */
export async function assignDistribuidorIfNeeded(
  usuarioId: number,
  username: string
): Promise<void> {
  try {
    // Buscar si el usuario tiene asignado FWL_Distribuidor con rol activo.
    const fwlRow = await prisma.usuarioRol.findFirst({
      where: {
        usuarioId,
        rol: {
          nombre: "FWL_Distribuidor",
          estado: "A",
        },
      },
      select: { rolId: true },
    });

    if (!fwlRow) {
      // El usuario no tiene FWL_Distribuidor activo — nada que hacer.
      return;
    }

    // Buscar el id del rol Distribuidor (estado activo).
    const distribuidorRol = await prisma.rol.findFirst({
      where: { nombre: "Distribuidor", estado: "A" },
      select: { id: true },
    });

    if (!distribuidorRol) {
      authLog.warn("assignDistribuidorIfNeeded: rol 'Distribuidor' no encontrado en tabla rol", {
        usuarioId,
        username,
      });
      return;
    }

    // Upsert idempotente: si ya existe la fila no hace nada (update: {}).
    await prisma.usuarioRol.upsert({
      where: { usuarioId_rolId: { usuarioId, rolId: distribuidorRol.id } },
      create: { usuarioId, rolId: distribuidorRol.id },
      update: {},
    });

    authLog.info("assignDistribuidorIfNeeded: rol Distribuidor asignado", {
      usuarioId,
      username,
      rolId: distribuidorRol.id,
    });
  } catch (err) {
    authLog.error("assignDistribuidorIfNeeded: error al asignar rol Distribuidor", {
      usuarioId,
      username,
      error: (err as Error).message,
    });
  }
}
