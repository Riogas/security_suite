import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/aplicaciones/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const aplicacion = await prisma.aplicacion.findUnique({
      where: { id: parseInt(id) },
      include: { roles: true, funcionalidades: true },
    });
    if (!aplicacion) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, aplicacion });
  } catch (error) {
    console.error("[API/db/aplicaciones/[id] GET]", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

// PUT /api/db/aplicaciones/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { nombre, descripcion, estado, url, tecnologia, sistemaId } = body;

    const data: any = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (descripcion !== undefined) data.descripcion = descripcion;
    if (estado !== undefined) data.estado = estado;
    if (url !== undefined) data.url = url;
    if (tecnologia !== undefined) data.tecnologia = tecnologia;
    if (sistemaId !== undefined) data.sistemaId = sistemaId ? parseInt(sistemaId) : null;

    const aplicacion = await prisma.aplicacion.update({
      where: { id: parseInt(id) },
      data,
    });
    return NextResponse.json({ success: true, aplicacion });
  } catch (error) {
    console.error("[API/db/aplicaciones/[id] PUT]", error);
    return NextResponse.json({ success: false, error: "Error al actualizar" }, { status: 500 });
  }
}

// DELETE /api/db/aplicaciones/[id] — soft delete
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const aplicacion = await prisma.aplicacion.update({
      where: { id: parseInt(id) },
      data: { estado: "I" },
    });
    return NextResponse.json({ success: true, aplicacion });
  } catch (error) {
    console.error("[API/db/aplicaciones/[id] DELETE]", error);
    return NextResponse.json({ success: false, error: "Error al eliminar" }, { status: 500 });
  }
}
