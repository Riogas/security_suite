import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAuth } from "@/lib/auth/apiGuard";

// GET /api/db/funcionalidades/[id]/acciones
// Devuelve los ObjetoAccion seleccionados para esta funcionalidad
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Antes esto no chequeaba nada.
  const guard = await requireApiAuth(req);
  if (!guard.ok) return guard.respuesta;

  try {
    const { id: rawId } = await params;
    const funcionalidadId = parseInt(rawId);
    if (isNaN(funcionalidadId)) {
      return NextResponse.json({ success: false, error: "ID invalido" }, { status: 400 });
    }

    const items = await prisma.funcionalidadObjetoAccion.findMany({
      where: { funcionalidadId },
      include: {
        objeto: { select: { id: true, key: true, label: true, path: true } },
        objetoAccion: { select: { id: true, key: true, label: true, descripcion: true, codigo: true, path: true } },
      },
      orderBy: { id: "asc" },
    });

    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error("[API/db/funcionalidades/[id]/acciones GET]", error);
    return NextResponse.json({ success: false, error: "Error al obtener acciones" }, { status: 500 });
  }
}

// PUT /api/db/funcionalidades/[id]/acciones
// Reemplaza el set completo de items seleccionados
// Body: { items: Array<{ objetoId: number, objetoAccionId?: number | null }> }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Antes esto no chequeaba nada.
  const guard = await requireApiAuth(request);
  if (!guard.ok) return guard.respuesta;

  try {
    const { id: rawId } = await params;
    const funcionalidadId = parseInt(rawId);
    if (isNaN(funcionalidadId)) {
      return NextResponse.json({ success: false, error: "ID invalido" }, { status: 400 });
    }

    const body = await request.json();
    const items: { objetoId: number; objetoAccionId?: number | null }[] = body.items ?? [];

    await prisma.$transaction([
      prisma.funcionalidadObjetoAccion.deleteMany({ where: { funcionalidadId } }),
      ...(items.length
        ? [
            prisma.funcionalidadObjetoAccion.createMany({
              data: items.map((item) => ({
                funcionalidadId,
                objetoId: item.objetoId,
                objetoAccionId: item.objetoAccionId ?? null,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    const saved = await prisma.funcionalidadObjetoAccion.findMany({
      where: { funcionalidadId },
      include: {
        objeto: { select: { id: true, key: true, label: true, path: true } },
        objetoAccion: { select: { id: true, key: true, label: true, descripcion: true, codigo: true, path: true } },
      },
    });

    return NextResponse.json({ success: true, items: saved });
  } catch (error) {
    console.error("[API/db/funcionalidades/[id]/acciones PUT]", error);
    return NextResponse.json({ success: false, error: "Error al actualizar acciones" }, { status: 500 });
  }
}