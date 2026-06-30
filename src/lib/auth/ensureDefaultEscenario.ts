import { prisma } from "@/lib/prisma";
import { authLog } from "./logger";

/**
 * Si el usuario no tiene una preferencia `Escenario` en `usuario_preferencias`,
 * crea una con el escenario por defecto (configurable, default 1000 "Montevideo").
 *
 * Se invoca al login, después de que `refreshEscenarioForExternal` haya tenido
 * la oportunidad de poblarlo desde AS400. Si llegó hasta acá sin preferencia
 * significa:
 *   - usuario interno sin escenario configurado por admin, o
 *   - usuario externo cuyo AS400 no devolvió escenario (USUMOBILE sin agencia, etc.)
 *
 * Política conservadora: NO sobreescribe si ya existe (cualquier formato).
 *
 * Formato de escritura: objeto legacy `{"Nombre":"id"}` para máxima
 * compatibilidad con consumers actuales (TrackMovil, etc.) que leen ese formato.
 *
 * Configurable por env:
 *   DEFAULT_ESCENARIO_ID      (default 1000)
 *   DEFAULT_ESCENARIO_NOMBRE  (default "Montevideo")
 */
const DEFAULT_ESCENARIO_ID = parseInt(process.env.DEFAULT_ESCENARIO_ID || "1000", 10);
const DEFAULT_ESCENARIO_NOMBRE = (process.env.DEFAULT_ESCENARIO_NOMBRE || "Montevideo").trim();

export async function ensureDefaultEscenario(
  usuarioId: number,
  username: string,
): Promise<void> {
  if (!Number.isFinite(DEFAULT_ESCENARIO_ID) || !DEFAULT_ESCENARIO_NOMBRE) {
    // Config inválida — no hacemos nada (no rompemos el login).
    return;
  }

  try {
    const existing = await prisma.usuarioPreferencia.findFirst({
      where: { usuarioId, atributo: "Escenario" },
    });
    if (existing) return;

    const valor = JSON.stringify({ [DEFAULT_ESCENARIO_NOMBRE]: String(DEFAULT_ESCENARIO_ID) });
    await prisma.usuarioPreferencia.create({
      data: { usuarioId, atributo: "Escenario", valor },
    });
    authLog.info("ensureDefaultEscenario: creado escenario por defecto", {
      username,
      usuarioId,
      escenarioId: DEFAULT_ESCENARIO_ID,
      escenarioNom: DEFAULT_ESCENARIO_NOMBRE,
    });
  } catch (err) {
    authLog.error("ensureDefaultEscenario falló", {
      username,
      usuarioId,
      error: (err as Error).message,
    });
    // No re-throw: el escenario por defecto es complementario, no debe romper el login.
  }
}
