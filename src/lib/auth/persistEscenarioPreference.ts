import { prisma } from "@/lib/prisma";
import { authLog } from "./logger";

/**
 * Persiste o actualiza el escenario asignado al usuario como preferencia
 * `Escenario` con el formato JSON-string que ya consume el frontend
 * (TrackMovil, etc.):
 *
 *   atributo = 'Escenario'
 *   valor    = '[{"Nombre":"<nombre>","Valor":<id>}]'
 *
 * Política según `isExternal`:
 *
 *   isExternal = false (usuario interno):
 *     - Si ya existe preferencia → no-op (se respeta lo configurado por el admin).
 *     - Si no existe → INSERT con el dato de la fuente externa.
 *
 *   isExternal = true (usuario SGM/LDAP/GSIST):
 *     - Si ya existe y el valor coincide con AS400 → no-op.
 *     - Si ya existe y difiere → UPDATE con el valor de AS400 (refresh).
 *     - Si no existe → INSERT con el dato de AS400.
 *
 * Casos base:
 *   - escenarioId / escenarioNom inválidos → no-op (no existe agencia/escenario).
 *   - Errores de Prisma se loguean y no propagan: la preferencia es complementaria
 *     y no debe romper el login.
 */
export async function persistEscenarioPreference(
  usuarioId: number,
  escenarioId: number | null | undefined,
  escenarioNom: string | null | undefined,
  isExternal = false,
): Promise<void> {
  if (escenarioId == null || !Number.isFinite(Number(escenarioId))) return;
  const nombre = (escenarioNom ?? "").trim();
  if (!nombre) return;

  const newValor = JSON.stringify([{ Nombre: nombre, Valor: Number(escenarioId) }]);

  try {
    const existing = await prisma.usuarioPreferencia.findFirst({
      where: { usuarioId, atributo: "Escenario" },
    });

    if (existing) {
      if (!isExternal) {
        authLog.info("persistEscenarioPreference: ya existe (interno), no sobreescribo", { usuarioId });
        return;
      }
      if (existing.valor === newValor) {
        authLog.info("persistEscenarioPreference: AS400 == local, no toco", { usuarioId });
        return;
      }
      await prisma.usuarioPreferencia.update({
        where: { id: existing.id },
        data: { valor: newValor },
      });
      authLog.info("persistEscenarioPreference: actualizado desde AS400 (externo)", {
        usuarioId,
        escenarioId,
        escenarioNom: nombre,
        previo: existing.valor,
      });
      return;
    }

    await prisma.usuarioPreferencia.create({
      data: { usuarioId, atributo: "Escenario", valor: newValor },
    });
    authLog.info("persistEscenarioPreference: creado", { usuarioId, escenarioId, escenarioNom: nombre });
  } catch (err) {
    authLog.error("persistEscenarioPreference falló", {
      usuarioId,
      escenarioId,
      escenarioNom: nombre,
      error: (err as Error).message,
    });
  }
}
