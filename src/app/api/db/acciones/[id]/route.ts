import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/acciones/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const id = parseInt(rawId);
    if (isNaN(id)) return NextResponse.json({ success: false, error: "ID inválido" }, { status: 400 });

    const accion = await prisma.accion.findUnique({
      where: { id },
      include: {
        funcionalidades: {
          include: {
            funcionalidad: { select: { id: true, nombre: true, aplicacionId: true } },
          },
        },
      },
    });

    if (!accion) return NextResponse.json({ success: false, error: "Acción no encontrada" }, { status: 404 });

    return NextResponse.json({ success: true, accion });
  } catch (error) {
    console.error("[API/db/acciones/[id] GET]", error);
    return NextResponse.json({ success: false, error: "Error al obtener acción" }, { status: 500 });
  }
}

// PUT /api/db/acciones/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const id = parseInt(rawId);
    if (isNaN(id)) return NextResponse.json({ success: false, error: "ID inválido" }, { status: 400 });

    const body = await request.json();
    const { nombre, descripcion, estado } = body;

    const data: any = {};
    if (nombre !== undefined) data.nombre = nombre.trim();
    if (descripcion !== undefined) data.descripcion = descripcion?.trim() || null;
    if (estado !== undefined) data.estado = estado;

    const accion = await prisma.accion.update({ where: { id }, data });

    return NextResponse.json({ success: true, accion });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ success: false, error: "Acción no encontrada" }, { status: 404 });
    }
    console.error("[API/db/acciones/[id] PUT]", error);
    return NextResponse.json({ success: false, error: "Error al actualizar acción" }, { status: 500 });
  }
}

// DELETE /api/db/acciones/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const id = parseInt(rawId);
    if (isNaN(id)) return NextResponse.json({ success: false, error: "ID inválido" }, { status: 400 });

    await prisma.accion.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ success: false, error: "Acción no encontrada" }, { status: 404 });
    }
    console.error("[API/db/acciones/[id] DELETE]", error);
    return NextResponse.json({ success: false, error: "Error al eliminar acción" }, { status: 500 });
  }
}
