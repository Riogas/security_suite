import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/roles/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rol = await prisma.rol.findUnique({
      where: { id: parseInt(id) },
      include: {
        aplicacion: { select: { id: true, nombre: true } },
        funcionalidades: {
          include: { funcionalidad: { select: { id: true, nombre: true, estado: true } } },
        },
      },
    });
    if (!rol) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, rol });
  } catch (error) {
    console.error("[API/db/roles/[id] GET]", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

// PUT /api/db/roles/[id] — actualiza datos + reemplaza funcionalidades
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rolId = parseInt(id);
    const body = await request.json();
    const { nombre, descripcion, estado, nivel, creadoEn, funcionalidades } = body;

    const data: any = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (descripcion !== undefined) data.descripcion = descripcion;
    if (estado !== undefined) data.estado = estado;
    if (nivel !== undefined) data.nivel = nivel;
    if (creadoEn !== undefined) data.creadoEn = creadoEn;

    // Reemplazar funcionalidades si se envían
    if (funcionalidades !== undefined) {
      await prisma.rolFuncionalidad.deleteMany({ where: { rolId } });
      if (funcionalidades.length > 0) {
        await prisma.rolFuncionalidad.createMany({
          data: funcionalidades.map((f: any) => ({
            rolId,
            funcionalidadId: parseInt(f.funcionalidadId),
          })),
          skipDuplicates: true,
        });
      }
    }

    const rol = await prisma.rol.update({ where: { id: rolId }, data });
    return NextResponse.json({ success: true, rol });
  } catch (error) {
    console.error("[API/db/roles/[id] PUT]", error);
    return NextResponse.json({ success: false, error: "Error al actualizar rol" }, { status: 500 });
  }
}

// DELETE /api/db/roles/[id] — soft delete
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rol = await prisma.rol.update({ where: { id: parseInt(id) }, data: { estado: "I" } });
    return NextResponse.json({ success: true, rol });
  } catch (error) {
    console.error("[API/db/roles/[id] DELETE]", error);
    return NextResponse.json({ success: false, error: "Error al eliminar rol" }, { status: 500 });
  }
}
