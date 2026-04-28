import { prisma } from "@/lib/prisma";
import { authLog } from "./logger";

/**
 * Persiste el escenario asignado al usuario en SGM como preferencia
 * `Escenario` con el formato JSON-string que ya consume el frontend
 * (TrackMovil, etc.):
 *
 *   atributo = 'Escenario'
 *   valor    = '[{"Nombre":"<nombre>","Valor":<id>}]'
 *
 * Casos:
 *   - escenarioId / escenarioNom inválidos → no-op (no existe agencia/escenario en SGM).
 *   - Ya existe una preferencia 'Escenario' para el usuario → se reemplaza
 *     (delete + create) porque UsuarioPreferencia no tiene unique compuesto
 *     (usuarioId, atributo).
 *   - Errores de Prisma se loguean y no propagan: la preferencia es complementaria
 *     y no debe romper el login.
 */
export async function persistEscenarioPreference(
  usuarioId: number,
  escenarioId: number | null | undefined,
  escenarioNom: string | null | undefined,
): Promise<void> {
  if (escenarioId == null || !Number.isFinite(Number(escenarioId))) return;
  const nombre = (escenarioNom ?? "").trim();
  if (!nombre) return;

  const valor = JSON.stringify([{ Nombre: nombre, Valor: Number(escenarioId) }]);

  try {
    await prisma.$transaction([
      prisma.usuarioPreferencia.deleteMany({
        where: { usuarioId, atributo: "Escenario" },
      }),
      prisma.usuarioPreferencia.create({
        data: { usuarioId, atributo: "Escenario", valor },
      }),
    ]);
    authLog.info("persistEscenarioPreference ok", { usuarioId, escenarioId, escenarioNom: nombre });
  } catch (err) {
    authLog.error("persistEscenarioPreference falló", {
      usuarioId,
      escenarioId,
      escenarioNom: nombre,
      error: (err as Error).message,
    });
  }
}
