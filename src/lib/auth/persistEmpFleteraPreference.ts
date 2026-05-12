import { prisma } from "@/lib/prisma";
import { authLog } from "./logger";

/**
 * Persiste la empresa fletera vinculada al usuario en SGM como preferencia
 * `EmpFletera` con el formato JSON-string que ya consume el frontend
 * (TrackMovil, etc.):
 *
 *   atributo = 'EmpFletera'
 *   valor    = '[{"Nombre":"<nombre>","Valor":<id>}]'
 *
 * El ID viene de `GXICAGEO.AGENCIA.AGENCIAVINCEMPFLT` y el nombre del JOIN
 * con `GXCALDTA.EFLETERA.EFLNOM`.
 *
 * Casos:
 *   - empFleteraId / empFleteraNom inválidos (null, 0, sin nombre) → no-op:
 *     la agencia del usuario no tiene fletera vinculada.
 *   - Ya existe una preferencia 'EmpFletera' para el usuario → no-op: se respeta
 *     lo configurado por el admin en security_suite y NO se sobreescribe.
 *   - No existe preferencia 'EmpFletera' para el usuario → INSERT con el dato de SGM.
 *   - Errores de Prisma se loguean y no propagan: la preferencia es
 *     complementaria y no debe romper el login.
 *
 * Análogo a persistEscenarioPreference — mantener ambos en sync si se
 * agregan campos al payload de SGM.
 */
export async function persistEmpFleteraPreference(
  usuarioId: number,
  empFleteraId: number | null | undefined,
  empFleteraNom: string | null | undefined,
): Promise<void> {
  if (empFleteraId == null || !Number.isFinite(Number(empFleteraId)) || Number(empFleteraId) <= 0) return;
  const nombre = (empFleteraNom ?? "").trim();
  if (!nombre) return;

  try {
    const existing = await prisma.usuarioPreferencia.findFirst({
      where: { usuarioId, atributo: "EmpFletera" },
    });

    if (existing) {
      authLog.info("persistEmpFleteraPreference: ya existe, no se sobreescribe", { usuarioId });
      return;
    }

    const valor = JSON.stringify([{ Nombre: nombre, Valor: Number(empFleteraId) }]);
    await prisma.usuarioPreferencia.create({
      data: { usuarioId, atributo: "EmpFletera", valor },
    });
    authLog.info("persistEmpFleteraPreference ok", { usuarioId, empFleteraId, empFleteraNom: nombre });
  } catch (err) {
    authLog.error("persistEmpFleteraPreference falló", {
      usuarioId,
      empFleteraId,
      empFleteraNom: nombre,
      error: (err as Error).message,
    });
  }
}
