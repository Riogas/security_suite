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
 *   - Ya existe una preferencia 'Escenario' para el usuario → no-op: se respeta
 *     lo configurado por el admin en security_suite y NO se sobreescribe.
 *   - No existe preferencia 'Escenario' para el usuario → INSERT con el dato de SGM.
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

  try {
    const existing = await prisma.usuarioPreferencia.findFirst({
      where: { usuarioId, atributo: "Escenario" },
    });

    if (existing) {
      authLog.info("persistEscenarioPreference: ya existe, no se sobreescribe", { usuarioId });
      return;
    }

    const valor = JSON.stringify([{ Nombre: nombre, Valor: Number(escenarioId) }]);
    await prisma.usuarioPreferencia.create({
      data: { usuarioId, atributo: "Escenario", valor },
    });
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
