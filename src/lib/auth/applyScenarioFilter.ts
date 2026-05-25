import { prisma } from "@/lib/prisma";
import { authLog } from "./logger";

// ID del rol "Root" (admin total). Configurable por env para mantener consistencia
// con applyAdmsecGroupRoles.ts. Si un usuario tiene este rol asignado en
// usuario_roles, bypasea completamente el filtro de escenario: todos sus roles
// aplican sin importar el escenario activo, y se permite el login aunque
// no tenga preferencia de escenario configurada.
//
// Nota: este bypass es por el ROL como tal (id en usuario_roles), no por el
// flag legacy `usuarios.es_root` — son cosas distintas. Un usuario puede tener
// uno, el otro, los dos o ninguno.
const ROL_ROOT_ID = parseInt(process.env.PG_ROL_ROOT_ID || "52", 10);

interface EscenarioPrefValue {
  Nombre: string;
  Valor: number | string;
}

/**
 * Parsea el valor JSON de una preferencia `Escenario` y devuelve una lista
 * normalizada `[{id, nombre}, ...]`. Tolera dos formatos en producción:
 *
 *   - Formato legacy (objeto):  `{"Montevideo":"1000","Cordoba":"2000"}`
 *     — keys son nombres, values son ids (string o number).
 *   - Formato nuevo (array):    `[{"Nombre":"Montevideo","Valor":1000}, ...]`
 *
 * Devuelve [] ante JSON inválido o tipos inesperados (falla silenciosa).
 */
export function parseEscenariosFromValor(
  valor: string | null | undefined
): Array<{ id: number; nombre: string }> {
  if (!valor) return [];
  try {
    const parsed = JSON.parse(valor);
    // Legacy object: {"Nombre": "id", ...}
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.entries(parsed)
        .map(([nombre, id]) => ({ nombre: String(nombre).trim(), id: Number(id) }))
        .filter((e) => Number.isFinite(e.id));
    }
    // Array of {Nombre, Valor}
    if (Array.isArray(parsed)) {
      return (parsed as EscenarioPrefValue[])
        .map((e) => ({ nombre: String(e?.Nombre ?? "").trim(), id: Number(e?.Valor) }))
        .filter((e) => Number.isFinite(e.id));
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Parsea el valor JSON de una `RolPreferencia` con atributo `Escenario`
 * y devuelve los IDs de escenario configurados para ese rol.
 * Soporta ambos formatos (objeto legacy + array nuevo).
 */
function parseRolEscenarios(valor: string | null | undefined): number[] {
  return parseEscenariosFromValor(valor).map((e) => e.id);
}

/**
 * Parsea el valor JSON de una `UsuarioPreferencia` con atributo `Escenario`
 * y devuelve el primer escenario activo del usuario.
 * Devuelve null si no hay preferencia o el valor es inválido.
 * Soporta ambos formatos (objeto legacy + array nuevo).
 */
export function parseEscenarioFromPref(
  valor: string | null | undefined
): { id: number; nombre: string } | null {
  const all = parseEscenariosFromValor(valor);
  return all[0] ?? null;
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

  // Bypass por rol Root asignado: si el usuario tiene el rol id PG_ROL_ROOT_ID
  // (default 52), todos sus roles aplican como GLOBALES sin importar el escenario
  // del usuario ni los Escenarios configurados en cada rol. Root = admin total.
  const hasRootRol = assigned.some((ur) => ur.rolId === ROL_ROOT_ID);
  if (hasRootRol) {
    authLog.info("getApplicableRoles: bypass por rol Root asignado", {
      username,
      usuarioId,
      escenarioId,
      totalRoles: assigned.length,
    });
    return {
      applicable: assigned.map((ur) => ({
        rolId: ur.rolId,
        nombre: ur.rol.nombre,
        global: true,
      })),
      filteredOut: [],
      totalAssigned: assigned.length,
    };
  }

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
