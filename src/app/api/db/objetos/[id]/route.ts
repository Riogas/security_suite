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

    // 1) Actualizar campos del objeto (sin tocar acciones)
    await prisma.objeto.update({ where: { id: numId }, data });

    // 2) Reconciliar acciones POR CLAVE (preserva ids y sus vínculos
    //    FuncionalidadObjetoAccion, que tienen onDelete: Cascade sobre objetoAccionId).
    //    Antes se borraban+recreaban todas, lo que borraba en cascada los vínculos.
    if (acciones !== undefined) {
      const incoming = (acciones as any[]).filter((a) => a.key && String(a.key).trim());
      const existing = await prisma.objetoAccion.findMany({
        where: { objetoId: numId },
        select: { id: true, key: true },
      });
      const existingByKey = new Map(existing.map((e) => [e.key, e]));
      const incomingKeys = new Set(incoming.map((a) => String(a.key).trim()));

      const campos = (a: any) => ({
        key: String(a.key).trim(),
        descripcion: a.descripcion || null,
        codigo: a.codigo || null,
        label: a.label || null,
        path: a.path || null,
        icon: a.icon || null,
        relacion: a.relacion ? parseInt(a.relacion) : null,
        creadoEn: a.creadoEn || creadoEn || null,
      });

      await prisma.$transaction(async (tx) => {
        // borrar solo las que ya no están (sus vínculos se borran en cascada, correcto)
        const aBorrar = existing.filter((e) => !incomingKeys.has(e.key)).map((e) => e.id);
        if (aBorrar.length > 0) {
          await tx.objetoAccion.deleteMany({ where: { id: { in: aBorrar } } });
        }
        for (const a of incoming) {
          const ex = existingByKey.get(String(a.key).trim());
          if (ex) {
            await tx.objetoAccion.update({ where: { id: ex.id }, data: campos(a) });
          } else {
            await tx.objetoAccion.create({ data: { objetoId: numId, ...campos(a) } });
          }
        }
      });
    }

    const objeto = await prisma.objeto.findUnique({
      where: { id: numId },
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
