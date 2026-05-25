import { prisma } from "@/lib/prisma";
import { authLog } from "./logger";

interface EscenarioPrefValue {
  Nombre: string;
  Valor: number;
}

/**
 * Parsea el valor JSON de una `RolPreferencia` con atributo `Escenario`
 * y devuelve los IDs de escenario configurados para ese rol.
 * Devuelve [] si el valor es nulo o inválido (falla silenciosa).
 */
function parseRolEscenarios(valor: string | null | undefined): number[] {
  if (!valor) return [];
  try {
    const parsed: EscenarioPrefValue[] = JSON.parse(valor);
    return parsed.map((e) => Number(e.Valor)).filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

/**
 * Parsea el valor JSON de una `UsuarioPreferencia` con atributo `Escenario`
 * y devuelve el primer escenario activo del usuario.
 * Devuelve null si no hay preferencia o el valor es inválido.
 */
export function parseEscenarioFromPref(
  valor: string | null | undefined
): { id: number; nombre: string } | null {
  if (!valor) return null;
  try {
    const parsed: EscenarioPrefValue[] = JSON.parse(valor);
    const first = parsed[0];
    if (!first || !Number.isFinite(Number(first.Valor))) return null;
    return { id: Number(first.Valor), nombre: (first.Nombre ?? "").trim() };
  } catch {
    return null;
  }
}

export interface ApplicableRolesResult {
  applicable: Array<{ rolId: number; nombre: string; global: boolean }>;
  filteredOut: Array<{ rolId: number; nombre: string; escenarios: number[] }>;
  totalAssigned: number;
}

/**
 * Filtra los roles asignados al usuario según el escenario activo.
 *
 * Reglas:
 *   - Rol SIN `RolPreferencia` con atributo `Escenario` → GLOBAL: siempre aplica.
 *   - Rol CON `RolPreferencia.Escenario` que incluye `escenarioId` → aplica.
 *   - Rol CON `RolPreferencia.Escenario` que NO incluye `escenarioId` → filtrado.
 *   - Si `escenarioId` es null → solo aplican roles GLOBALES.
 *
 * Logguea: resultado de filtro (info si hay filteredOut, debug si todo aplica).
 */
export async function getApplicableRoles(
  usuarioId: number,
  escenarioId: number | null,
  username?: string,
): Promise<ApplicableRolesResult> {
  const assigned = await prisma.usuarioRol.findMany({
    where: { usuarioId },
    include: {
      rol: {
        include: {
          preferencias: { where: { atributo: "Escenario" } },
        },
      },
    },
  });

  const applicable: ApplicableRolesResult["applicable"] = [];
  const filteredOut: ApplicableRolesResult["filteredOut"] = [];

  for (const ur of assigned) {
    const escPref = ur.rol.preferencias[0];
    if (!escPref) {
      // Sin atributo Escenario → rol GLOBAL.
      applicable.push({ rolId: ur.rolId, nombre: ur.rol.nombre, global: true });
      continue;
    }
    const rolEscenarios = parseRolEscenarios(escPref.valor);
    if (escenarioId != null && rolEscenarios.includes(escenarioId)) {
      applicable.push({ rolId: ur.rolId, nombre: ur.rol.nombre, global: false });
    } else {
      filteredOut.push({ rolId: ur.rolId, nombre: ur.rol.nombre, escenarios: rolEscenarios });
    }
  }

  if (filteredOut.length > 0) {
    authLog.info("getApplicableRoles: roles filtrados por escenario", {
      username,
      usuarioId,
      escenarioId,
      applicable: applicable.map((r) => r.rolId),
      filteredOut: filteredOut.map((r) => ({ rolId: r.rolId, escenarios: r.escenarios })),
    });
  }

  return { applicable, filteredOut, totalAssigned: assigned.length };
}
