import { prisma } from "@/lib/prisma";
import { authLog } from "./logger";
import { parseEscenariosFromValor } from "./applyScenarioFilter";

/**
 * Persiste o actualiza el escenario asignado al usuario como preferencia
 * `Escenario`. Soporta dos formatos en producción:
 *
 *   - Legacy (objeto):  `{"Montevideo":"1000"}`     ← histórico, lo escribe SGM/GeneXus
 *   - Nuevo (array):    `[{"Nombre":"Montevideo","Valor":1000}]`
 *
 * Política de escritura:
 *   - Al UPDATE preservamos el formato que ya tiene la fila (no rompemos consumers
 *     que leen formato legacy como TrackMovil).
 *   - Al CREATE usamos el formato legacy objeto (lo más conservador para máxima
 *     compatibilidad con consumers actuales).
 *
 * Política según `isExternal`:
 *
 *   isExternal = false (usuario interno):
 *     - Si ya existe preferencia → no-op (se respeta lo configurado por el admin).
 *     - Si no existe → INSERT con el dato de la fuente externa.
 *
 *   isExternal = true (usuario SGM/LDAP/GSIST):
 *     - Si ya existe y el ID de escenario coincide con AS400 (comparación
 *       SEMÁNTICA, no string-raw) → no-op.
 *     - Si ya existe y difiere → UPDATE preservando el formato existente.
 *     - Si no existe → INSERT con formato objeto legacy.
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

  const newId = Number(escenarioId);

  try {
    const existing = await prisma.usuarioPreferencia.findFirst({
      where: { usuarioId, atributo: "Escenario" },
    });

    if (existing) {
      if (!isExternal) {
        authLog.info("persistEscenarioPreference: ya existe (interno), no sobreescribo", { usuarioId });
        return;
      }
      // Comparación semántica (no string-raw) para tolerar ambos formatos.
      const currentIds = parseEscenariosFromValor(existing.valor).map((e) => e.id);
      if (currentIds.length === 1 && currentIds[0] === newId) {
        authLog.info("persistEscenarioPreference: AS400 == local (semantic), no toco", { usuarioId });
        return;
      }
      // Preservar el formato existente al sobreescribir.
      const existingIsArray = (existing.valor ?? "").trim().startsWith("[");
      const newValor = existingIsArray
        ? JSON.stringify([{ Nombre: nombre, Valor: newId }])
        : JSON.stringify({ [nombre]: String(newId) });
      await prisma.usuarioPreferencia.update({
        where: { id: existing.id },
        data: { valor: newValor },
      });
      authLog.info("persistEscenarioPreference: actualizado desde AS400 (externo)", {
        usuarioId,
        escenarioId: newId,
        escenarioNom: nombre,
        formato: existingIsArray ? "array" : "objeto",
        previo: existing.valor,
      });
      return;
    }

    // Sin preferencia previa: INSERT en formato objeto legacy (máxima compatibilidad).
    const newValor = JSON.stringify({ [nombre]: String(newId) });
    await prisma.usuarioPreferencia.create({
      data: { usuarioId, atributo: "Escenario", valor: newValor },
    });
    authLog.info("persistEscenarioPreference: creado", { usuarioId, escenarioId: newId, escenarioNom: nombre });
  } catch (err) {
    authLog.error("persistEscenarioPreference falló", {
      usuarioId,
      escenarioId,
      escenarioNom: nombre,
      error: (err as Error).message,
    });
  }
}
