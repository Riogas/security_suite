import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PISTERO_ROL_ID = 54; // RiogasTracking → rol "Pistero" (otorga PermiteLogin)

type Accion = "toggle" | "grant" | "revoke";

// POST /api/db/usuarios/[id]/permite-login
// Body (opcional): { accion?: "toggle" | "grant" | "revoke" }   default: "toggle"
//
// Asigna o quita el rol "Pistero" (id=54) al usuario via tabla `usuario_roles`.
// El rol "Pistero" incluye la funcionalidad PermiteLogin, por lo que asignarlo
// habilita el login del usuario en RiogasTracking.
//   - toggle: si ya tiene el rol lo quita, si no lo tiene lo asigna.
//   - grant: lo asigna (idempotente, no falla si ya lo tenia).
//   - revoke: lo quita (idempotente, no falla si no lo tenia).
//
// Nota: el campo `habilitado` en la respuesta refleja PermiteLogin real
// (considerando todos los roles del usuario y la tabla `accesos`). Puede ser
// true incluso despues de un revoke si el usuario tiene PermiteLogin por
// otro rol o por acceso directo.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const usuarioId = parseInt(id, 10);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return NextResponse.json(
        { success: false, error: "id de usuario invalido" },
        { status: 400 },
      );
    }

    let accion: Accion = "toggle";
    try {
      const body = await req.json();
      if (body && typeof body.accion === "string") {
        if (["toggle", "grant", "revoke"].includes(body.accion)) {
          accion = body.accion as Accion;
        } else {
          return NextResponse.json(
            {
              success: false,
              error: 'accion debe ser "toggle", "grant" o "revoke"',
            },
            { status: 400 },
          );
        }
      }
    } catch {
      // Body vacio o invalido → usar default "toggle"
    }

    // Validar que el usuario existe
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, username: true },
    });
    if (!usuario) {
      return NextResponse.json(
        { success: false, error: "usuario no encontrado" },
        { status: 404 },
      );
    }

    // Validar que el rol Pistero existe
    const rolPistero = await prisma.rol.findUnique({
      where: { id: PISTERO_ROL_ID },
      select: { id: true, nombre: true },
    });
    if (!rolPistero) {
      return NextResponse.json(
        { success: false, error: "rol Pistero no encontrado" },
        { status: 500 },
      );
    }

    // Estado actual
    const existing = await prisma.usuarioRol.findUnique({
      where: {
        usuarioId_rolId: { usuarioId, rolId: PISTERO_ROL_ID },
      },
    });
    const tenia = !!existing;

    // Resolver acción final
    let debeQuedarAsignado: boolean;
    switch (accion) {
      case "grant":
        debeQuedarAsignado = true;
        break;
      case "revoke":
        debeQuedarAsignado = false;
        break;
      case "toggle":
      default:
        debeQuedarAsignado = !tenia;
        break;
    }

    let resultado: "granted" | "revoked" | "noop";

    if (debeQuedarAsignado && !tenia) {
      await prisma.usuarioRol.create({
        data: { usuarioId, rolId: PISTERO_ROL_ID },
      });
      resultado = "granted";
    } else if (!debeQuedarAsignado && tenia) {
      await prisma.usuarioRol.delete({
        where: {
          usuarioId_rolId: { usuarioId, rolId: PISTERO_ROL_ID },
        },
      });
      resultado = "revoked";
    } else {
      resultado = "noop"; // grant en usuario que ya lo tenia, o revoke en usuario que no lo tenia
    }

    // Calcular `habilitado` real (rol + accesos) post-operacion
    const habilitado = await calcularHabilitado(usuarioId);

    return NextResponse.json({
      success: true,
      usuarioId,
      username: usuario.username,
      rolId: PISTERO_ROL_ID,
      rolNombre: rolPistero.nombre,
      accion,
      resultado,
      tieneRol: debeQuedarAsignado,
      habilitado,
    });
  } catch (error) {
    console.error("[API/db/usuarios/[id]/permite-login POST]", error);
    return NextResponse.json(
      { success: false, error: "Error al cambiar rol Pistero" },
      { status: 500 },
    );
  }
}

// true si el usuario tiene PermiteLogin via algun rol activo O via acceso directo (efecto != "deny")
async function calcularHabilitado(usuarioId: number): Promise<boolean> {
  const rolHit = await prisma.usuarioRol.findFirst({
    where: {
      usuarioId,
      rol: {
        estado: "A",
        funcionalidades: { some: { funcionalidad: { nombre: "PermiteLogin" } } },
      },
    },
    select: { rolId: true },
  });
  if (rolHit) return true;

  const accesoHit = await prisma.acceso.findFirst({
    where: {
      usuarioId,
      funcionalidad: { nombre: "PermiteLogin" },
    },
    select: { efecto: true },
  });
  if (accesoHit && accesoHit.efecto?.toLowerCase() !== "deny") return true;

  return false;
}
