import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// =====================================================================
// Helpers compartidos de permisos / accesos (Postgres).
// Usados por /api/db/permisos, /api/db/solicitudes y el flujo de
// aprobación. Centraliza: extracción de JWT, resolución de usuario,
// normalización del campo `efecto` y el gating de aprobadores.
// =====================================================================

// El campo `accesos.efecto` quedó inconsistente históricamente: el modal
// "Asignar Funcionalidades" guarda "grant"/"deny" pero datos legacy y el
// default del schema usan "ALLOW". Se normaliza el lado lectura aceptando
// ambos. El flujo nuevo escribe siempre "grant"/"deny".
export const EFECTOS_ALLOW = ["grant", "GRANT", "ALLOW", "allow"];
export const EFECTOS_DENY = ["deny", "DENY"];
export const EFECTO_GRANT = "grant";
export const EFECTO_DENY = "deny";

// Objeto + acción que designan a un usuario como aprobador de solicitudes.
export const APROBADOR_OBJETO_KEY = "solicitudes";
export const APROBADOR_ACCION_KEY = "approve";

export function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

export function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return req.cookies.get("token")?.value ?? null;
}

export interface UsuarioAuth {
  id: number;
  esRoot: string;
  username: string;
}

/**
 * Resuelve el usuario autenticado a partir del JWT (header o cookie).
 * Devuelve null si no hay token válido o el usuario no existe / inactivo.
 */
export async function resolveUsuario(
  req: NextRequest,
): Promise<UsuarioAuth | null> {
  const token = extractToken(req);
  if (!token) return null;

  const payload = decodeJwt(token);
  if (!payload) return null;

  const rawUsername = (payload.username ??
    payload.sub ??
    payload.name ??
    payload.email ??
    payload.preferred_username ??
    null) as string | null;

  if (!rawUsername) return null;

  const usuario = await prisma.usuario.findFirst({
    where: {
      OR: [
        { username: { equals: String(rawUsername).trim(), mode: "insensitive" } },
        { email: { equals: String(rawUsername).trim(), mode: "insensitive" } },
      ],
      estado: "A",
    },
    select: { id: true, esRoot: true, username: true },
  });

  return usuario;
}

/**
 * Resuelve la aplicación a partir de un id (número) o un nombre (string).
 * Acepta el contrato PascalCase del check GeneXus (`AplicacionId`) y, por
 * tolerancia, el nombre. Default: NEXT_PUBLIC_APLICACION_ID / APLICACION_ID.
 */
export async function resolveAplicacionId(
  aplicacionId?: number | string | null,
  aplicacionNombre?: string | null,
): Promise<number | null> {
  const idNum = Number(aplicacionId);
  if (Number.isFinite(idNum) && idNum > 0) {
    const app = await prisma.aplicacion.findFirst({
      where: { id: idNum, estado: "A" },
      select: { id: true },
    });
    if (app) return app.id;
  }

  if (aplicacionNombre) {
    const app = await prisma.aplicacion.findFirst({
      where: {
        nombre: { equals: String(aplicacionNombre).trim(), mode: "insensitive" },
        estado: "A",
      },
      select: { id: true },
    });
    if (app) return app.id;
  }

  const envId = Number(
    process.env.NEXT_PUBLIC_APLICACION_ID ?? process.env.APLICACION_ID ?? 0,
  );
  return Number.isFinite(envId) && envId > 0 ? envId : null;
}

/**
 * ¿El usuario puede aprobar/rechazar solicitudes?
 * Root siempre; en otro caso debe tener acceso (directo grant vigente o vía
 * rol) a alguna funcionalidad vinculada al objeto `solicitudes` + acción
 * `approve`.
 */
export async function usuarioPuedeAprobar(
  usuario: Pick<UsuarioAuth, "id" | "esRoot">,
): Promise<boolean> {
  if (usuario.esRoot === "S") return true;

  const objeto = await prisma.objeto.findFirst({
    where: { key: APROBADOR_OBJETO_KEY, estado: "A" },
    select: { id: true },
  });
  if (!objeto) return false;

  const accion = await prisma.objetoAccion.findFirst({
    where: {
      objetoId: objeto.id,
      key: { equals: APROBADOR_ACCION_KEY, mode: "insensitive" },
    },
    select: { id: true },
  });

  const funcLinks = await prisma.funcionalidadObjetoAccion.findMany({
    where: {
      objetoId: objeto.id,
      ...(accion ? { objetoAccionId: accion.id } : {}),
      funcionalidad: { estado: "A" },
    },
    select: { funcionalidadId: true },
  });
  const funcIds = [...new Set(funcLinks.map((f) => f.funcionalidadId))];
  if (funcIds.length === 0) return false;

  const now = new Date();

  const accesoDirecto = await prisma.acceso.findFirst({
    where: {
      usuarioId: usuario.id,
      funcionalidadId: { in: funcIds },
      efecto: { in: EFECTOS_ALLOW },
      OR: [{ fechaDesde: null }, { fechaDesde: { lte: now } }] as object[],
      AND: [{ OR: [{ fechaHasta: null }, { fechaHasta: { gte: now } }] }] as object[],
    },
    select: { funcionalidadId: true },
  });
  if (accesoDirecto) return true;

  const rolesActivos = await prisma.usuarioRol.findMany({
    where: {
      usuarioId: usuario.id,
      OR: [{ fechaDesde: null }, { fechaDesde: { lte: now } }] as object[],
      AND: [{ OR: [{ fechaHasta: null }, { fechaHasta: { gte: now } }] }] as object[],
      rol: { estado: "A" },
    },
    select: { rolId: true },
  });
  const rolIds = rolesActivos.map((r) => r.rolId);
  if (rolIds.length === 0) return false;

  const rolFunc = await prisma.rolFuncionalidad.findFirst({
    where: { rolId: { in: rolIds }, funcionalidadId: { in: funcIds } },
    select: { funcionalidadId: true },
  });
  return Boolean(rolFunc);
}
