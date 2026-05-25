import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import type { VerifiedBy } from "./types";

const JWT_SECRET = process.env.JWT_SECRET || "security-suite-secret-key";

function emptyAuthBody(message: string) {
  return {
    success: false,
    message,
    token: "",
    user: null,
    expiresIn: "0",
    requireIdentity: false,
    verifiedBy: "",
  };
}

export function badRequest(message: string) {
  return NextResponse.json(emptyAuthBody(message), { status: 400 });
}

export function unauthorized(message = "Usuario sin privilegios para acceder al sistema.") {
  return NextResponse.json(emptyAuthBody(message), { status: 401 });
}

export function forbidden(message: string) {
  return NextResponse.json(emptyAuthBody(message), { status: 403 });
}

export function serverError(message = "Error interno del servidor") {
  return NextResponse.json(emptyAuthBody(message), { status: 500 });
}

// Construye la respuesta de éxito y, de paso, actualiza fechaUltimoLogin (solo en éxito).
// `applicableRolIds`: si no es null, filtra los roles del usuario al subconjunto aplicable
//   según el escenario activo. null significa sin filtro (todos los roles aplican).
// `escenario`: escenario activo del usuario al momento del login, para incluirlo en la respuesta.
export async function buildSuccessResponse(
  usuarioId: number,
  sistema: string,
  verifiedBy: VerifiedBy,
  applicableRolIds: number[] | null = null,
  escenario: { id: number; nombre: string } | null = null,
) {
  // Construimos la cláusula where de roles: si hay filtro por escenario, solo traemos
  // los roles que aplican. Esto asegura que el JWT y el payload no incluyen roles
  // de escenarios distintos al activo.
  const rolesWhere =
    applicableRolIds != null
      ? { usuarioId, rolId: { in: applicableRolIds } }
      : { usuarioId };

  const [usuario, roles, preferencias, accesos] = await Promise.all([
    prisma.usuario.update({
      where: { id: usuarioId },
      data: { fechaUltimoLogin: new Date() },
    }),
    prisma.usuarioRol.findMany({
      where: rolesWhere,
      include: {
        rol: {
          include: {
            funcionalidades: {
              select: {
                funcionalidadId: true,
                funcionalidad: { select: { nombre: true } },
              },
            },
            preferencias: {
              select: { atributo: true, valor: true },
            },
          },
        },
      },
    }),
    prisma.usuarioPreferencia.findMany({
      where: { usuarioId },
      select: { atributo: true, valor: true },
    }),
    prisma.acceso.findMany({
      where: { usuarioId },
      select: {
        funcionalidadId: true,
        efecto: true,
        funcionalidad: {
          select: {
            nombre: true,
            objetoAcciones: {
              select: {
                objetoAccion: {
                  select: { key: true, codigo: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const token = jwt.sign(
    { iss: "security-suite", username: usuario.username, userId: usuario.id, sistema },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  const nombre =
    [usuario.nombre, usuario.apellido].filter(Boolean).join(" ").trim() ||
    usuario.username;

  return NextResponse.json({
    success: true,
    message: "",
    token,
    expiresIn: "604800",
    requireIdentity: false,
    verifiedBy,
    user: {
      id: String(usuario.id),
      username: usuario.username.trim(),
      nombre,
      email: usuario.email || "",
      isRoot: usuario.esRoot || "N",
    },
    escenario,
    roles: roles.map((ur) => ({
      rolId: ur.rolId,
      rolNombre: ur.rol.nombre,
      aplicacionId: ur.rol.aplicacionId,
      funcionalidades: ur.rol.funcionalidades.map((rf) => ({
        funcionalidadId: rf.funcionalidadId,
        nombre: rf.funcionalidad.nombre,
      })),
      atributos: ur.rol.preferencias.map((p) => ({ atributo: p.atributo, valor: p.valor })),
    })),
    preferencias: preferencias.map((p) => ({ atributo: p.atributo, valor: p.valor })),
    accesos: accesos.map((a) => ({
      funcionalidadId: a.funcionalidadId,
      funcionalidadNombre: a.funcionalidad.nombre,
      efecto: a.efecto,
      objetoAcciones: a.funcionalidad.objetoAcciones
        .map((foa) =>
          foa.objetoAccion ? { key: foa.objetoAccion.key, codigo: foa.objetoAccion.codigo } : null
        )
        .filter((x): x is { key: string; codigo: string | null } => x !== null),
    })),
  });
}
