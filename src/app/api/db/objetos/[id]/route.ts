import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/objetos/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const objeto = await prisma.objeto.findUnique({
      where: { id: parseInt(id) },
      include: { acciones: { orderBy: { id: "asc" } } },
    });
    if (!objeto) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, objeto });
  } catch (error) {
    console.error("[API/db/objetos/[id] GET]", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

// PUT /api/db/objetos/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numId = parseInt(id);
    const body = await request.json();
    const { aplicacionId, tipo, key, label, path, icon, orden, estado, esPublico, parentId, creadoEn, acciones } = body;

    const data: any = {};
    if (aplicacionId !== undefined) data.aplicacionId = parseInt(aplicacionId);
    if (tipo !== undefined) data.tipo = tipo;
    if (key !== undefined) data.key = key;
    if (label !== undefined) data.label = label || null;
    if (path !== undefined) data.path = path || null;
    if (icon !== undefined) data.icon = icon || null;
    if (orden !== undefined) data.orden = orden;
    if (estado !== undefined) data.estado = estado;
    if (esPublico !== undefined) data.esPublico = esPublico;
    if (parentId !== undefined) data.parentId = parentId ? parseInt(parentId) : null;
    if (creadoEn !== undefined) data.creadoEn = creadoEn || null;

    // Replace acciones: delete all existing and create new ones
    if (acciones !== undefined) {
      await prisma.objetoAccion.deleteMany({ where: { objetoId: numId } });
      data.acciones = {
        create: (acciones as any[]).map((a) => ({
          key: a.key,
          descripcion: a.descripcion || null,
          codigo: a.codigo || null,
          label: a.label || null,
          path: a.path || null,
          icon: a.icon || null,
          relacion: a.relacion ? parseInt(a.relacion) : null,
          creadoEn: a.creadoEn || creadoEn || null,
        })),
      };
    }

    const objeto = await prisma.objeto.update({
      where: { id: numId },
      data,
      include: { acciones: { orderBy: { id: "asc" } } },
    });

    return NextResponse.json({ success: true, objeto });
  } catch (error) {
    console.error("[API/db/objetos/[id] PUT]", error);
    return NextResponse.json({ success: false, error: "Error al actualizar" }, { status: 500 });
  }
}

// DELETE /api/db/objetos/[id] — soft delete
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const objeto = await prisma.objeto.update({
      where: { id: parseInt(id) },
      data: { estado: "I" },
    });
    return NextResponse.json({ success: true, objeto });
  } catch (error) {
    console.error("[API/db/objetos/[id] DELETE]", error);
    return NextResponse.json({ success: false, error: "Error al eliminar" }, { status: 500 });
  }
}
