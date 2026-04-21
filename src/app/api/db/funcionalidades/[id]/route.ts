import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/funcionalidades/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const funcionalidad = await prisma.funcionalidad.findUnique({
      where: { id: parseInt(id) },
      include: {
        aplicacion: { select: { id: true, nombre: true } },
        acciones: { include: { accion: true } },
      },
    });
    if (!funcionalidad) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, funcionalidad });
  } catch (error) {
    console.error("[API/db/funcionalidades/[id] GET]", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

// PUT /api/db/funcionalidades/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const funcId = parseInt(id);
    const body = await request.json();
    const { nombre, estado, esPublico, soloRoot, objetoKey, accionKey, fechaDesde, fechaHasta, acciones } = body;

    const data: any = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (estado !== undefined) data.estado = estado;
    if (esPublico !== undefined) data.esPublico = esPublico;
    if (soloRoot !== undefined) data.soloRoot = soloRoot;
    if (objetoKey !== undefined) data.objetoKey = objetoKey;
    if (accionKey !== undefined) data.accionKey = accionKey;
    if (fechaDesde !== undefined) data.fechaDesde = fechaDesde ? new Date(fechaDesde) : null;
    if (fechaHasta !== undefined) data.fechaHasta = fechaHasta ? new Date(fechaHasta) : null;

    // Reemplazar acciones si se envían
    if (acciones !== undefined) {
      await prisma.funcionalidadAccion.deleteMany({ where: { funcionalidadId: funcId } });
      if (acciones.length > 0) {
        await prisma.funcionalidadAccion.createMany({
          data: acciones.map((a: any) => ({ funcionalidadId: funcId, accionId: parseInt(a.accionId) })),
          skipDuplicates: true,
        });
      }
    }

    const funcionalidad = await prisma.funcionalidad.update({ where: { id: funcId }, data });
    return NextResponse.json({ success: true, funcionalidad });
  } catch (error) {
    console.error("[API/db/funcionalidades/[id] PUT]", error);
    return NextResponse.json({ success: false, error: "Error al actualizar funcionalidad" }, { status: 500 });
  }
}

// DELETE /api/db/funcionalidades/[id] — soft delete
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const funcionalidad = await prisma.funcionalidad.update({
      where: { id: parseInt(id) },
      data: { estado: "I" },
    });
    return NextResponse.json({ success: true, funcionalidad });
  } catch (error) {
    console.error("[API/db/funcionalidades/[id] DELETE]", error);
    return NextResponse.json({ success: false, error: "Error al eliminar funcionalidad" }, { status: 500 });
  }
}
