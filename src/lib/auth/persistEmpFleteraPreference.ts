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
 *   - Ya existe una preferencia 'EmpFletera' para el usuario → se reemplaza
 *     (delete + create) porque UsuarioPreferencia no tiene unique compuesto
 *     (usuarioId, atributo).
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

  const valor = JSON.stringify([{ Nombre: nombre, Valor: Number(empFleteraId) }]);

  try {
    await prisma.$transaction([
      prisma.usuarioPreferencia.deleteMany({
        where: { usuarioId, atributo: "EmpFletera" },
      }),
      prisma.usuarioPreferencia.create({
        data: { usuarioId, atributo: "EmpFletera", valor },
      }),
    ]);
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
