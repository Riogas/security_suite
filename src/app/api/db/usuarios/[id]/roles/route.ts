import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/usuarios/[id]/roles — roles asignados al usuario
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const usuarioId = parseInt(id);

    const usuarioRoles = await prisma.usuarioRol.findMany({
      where: { usuarioId },
      include: {
        rol: {
          include: { aplicacion: { select: { id: true, nombre: true } } },
        },
      },
    });

    return NextResponse.json({ success: true, roles: usuarioRoles });
  } catch (error) {
    console.error("[API/db/usuarios/[id]/roles GET]", error);
    return NextResponse.json({ success: false, error: "Error al obtener roles" }, { status: 500 });
  }
}

// PUT /api/db/usuarios/[id]/roles — reemplaza la asignación completa de roles
// Body: { roles: [{ rolId, fechaDesde?, fechaHasta? }] }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const usuarioId = parseInt(id);
    const body = await request.json();
    const { roles } = body; // Array de { rolId, fechaDesde?, fechaHasta? }

    // Borrar todos los roles actuales del usuario
    await prisma.usuarioRol.deleteMany({ where: { usuarioId } });

    // Crear los nuevos
    if (roles?.length > 0) {
      await prisma.usuarioRol.createMany({
        data: roles.map((r: any) => ({
          usuarioId,
          rolId: parseInt(r.rolId),
          fechaDesde: r.fechaDesde ? new Date(r.fechaDesde) : null,
          fechaHasta: r.fechaHasta ? new Date(r.fechaHasta) : null,
        })),
        skipDuplicates: true,
      });
    }

    const rolesActualizados = await prisma.usuarioRol.findMany({
      where: { usuarioId },
      include: {
        rol: { include: { aplicacion: { select: { id: true, nombre: true } } } },
      },
    });

    return NextResponse.json({ success: true, roles: rolesActualizados });
  } catch (error) {
    console.error("[API/db/usuarios/[id]/roles PUT]", error);
    return NextResponse.json({ success: false, error: "Error al asignar roles" }, { status: 500 });
  }
}
