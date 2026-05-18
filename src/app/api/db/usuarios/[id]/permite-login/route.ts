import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PERMITE_LOGIN_FUNCIONALIDAD_ID = 8; // RiogasTracking (app 5) → PermiteLogin

type Accion = "toggle" | "grant" | "revoke";

// POST /api/db/usuarios/[id]/permite-login
// Body (opcional): { accion?: "toggle" | "grant" | "revoke" }   default: "toggle"
//
// Asigna o quita la funcionalidad PermiteLogin (id=8) al usuario en la tabla `accesos`.
//   - toggle: si ya la tiene la quita, si no la tiene la asigna.
//   - grant: la asigna (idempotente, no falla si ya la tenia).
//   - revoke: la quita (idempotente, no falla si no la tenia).
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

    // Estado actual
    const existing = await prisma.acceso.findUnique({
      where: {
        funcionalidadId_usuarioId: {
          funcionalidadId: PERMITE_LOGIN_FUNCIONALIDAD_ID,
          usuarioId,
        },
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
      await prisma.acceso.create({
        data: {
          funcionalidadId: PERMITE_LOGIN_FUNCIONALIDAD_ID,
          usuarioId,
          efecto: "grant",
          creadoEn: new Date().toISOString(),
        },
      });
      resultado = "granted";
    } else if (!debeQuedarAsignado && tenia) {
      await prisma.acceso.delete({
        where: {
          funcionalidadId_usuarioId: {
            funcionalidadId: PERMITE_LOGIN_FUNCIONALIDAD_ID,
            usuarioId,
          },
        },
      });
      resultado = "revoked";
    } else {
      resultado = "noop"; // grant en usuario que ya lo tenia, o revoke en usuario que no lo tenia
    }

    return NextResponse.json({
      success: true,
      usuarioId,
      username: usuario.username,
      accion,
      resultado,
      habilitado: debeQuedarAsignado,
    });
  } catch (error) {
    console.error("[API/db/usuarios/[id]/permite-login POST]", error);
    return NextResponse.json(
      { success: false, error: "Error al cambiar PermiteLogin" },
      { status: 500 },
    );
  }
}
