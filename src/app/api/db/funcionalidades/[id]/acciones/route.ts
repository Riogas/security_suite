import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/funcionalidades/[id]/acciones
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const funcionalidadId = parseInt(rawId);
    if (isNaN(funcionalidadId)) {
      return NextResponse.json({ success: false, error: "ID inválido" }, { status: 400 });
    }

    const relaciones = await prisma.funcionalidadAccion.findMany({
      where: { funcionalidadId },
      include: { accion: true },
      orderBy: { accionId: "asc" },
    });

    return NextResponse.json({ success: true, acciones: relaciones.map((r) => r.accion) });
  } catch (error) {
    console.error("[API/db/funcionalidades/[id]/acciones GET]", error);
    return NextResponse.json({ success: false, error: "Error al obtener acciones" }, { status: 500 });
  }
}

// PUT /api/db/funcionalidades/[id]/acciones
// Reemplaza el set completo de acciones de la funcionalidad
// Body: { accionIds: number[] }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const funcionalidadId = parseInt(rawId);
    if (isNaN(funcionalidadId)) {
      return NextResponse.json({ success: false, error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const accionIds: number[] = body.accionIds ?? [];

    await prisma.$transaction([
      prisma.funcionalidadAccion.deleteMany({ where: { funcionalidadId } }),
      ...(accionIds.length
        ? [
            prisma.funcionalidadAccion.createMany({
              data: accionIds.map((accionId) => ({ funcionalidadId, accionId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    const relaciones = await prisma.funcionalidadAccion.findMany({
      where: { funcionalidadId },
      include: { accion: true },
    });

    return NextResponse.json({ success: true, acciones: relaciones.map((r) => r.accion) });
  } catch (error) {
    console.error("[API/db/funcionalidades/[id]/acciones PUT]", error);
    return NextResponse.json({ success: false, error: "Error al actualizar acciones" }, { status: 500 });
  }
}

// POST /api/db/funcionalidades/[id]/acciones
// Body: { accionIds: number[] }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const funcionalidadId = parseInt(rawId);
    if (isNaN(funcionalidadId)) {
      return NextResponse.json({ success: false, error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const accionIds: number[] = body.accionIds ?? [];

    if (!accionIds.length) {
      return NextResponse.json({ success: false, error: "accionIds es requerido" }, { status: 400 });
    }

    await prisma.funcionalidadAccion.createMany({
      data: accionIds.map((accionId) => ({ funcionalidadId, accionId })),
      skipDuplicates: true,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("[API/db/funcionalidades/[id]/acciones POST]", error);
    return NextResponse.json({ success: false, error: "Error al agregar acciones" }, { status: 500 });
  }
}

// DELETE /api/db/funcionalidades/[id]/acciones?accionId=
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const funcionalidadId = parseInt(rawId);
    const { searchParams } = new URL(request.url);
    const accionId = searchParams.get("accionId");

    if (isNaN(funcionalidadId)) {
      return NextResponse.json({ success: false, error: "ID inválido" }, { status: 400 });
    }

    if (accionId) {
      await prisma.funcionalidadAccion.delete({
        where: {
          funcionalidadId_accionId: { funcionalidadId, accionId: parseInt(accionId) },
        },
      });
    } else {
      await prisma.funcionalidadAccion.deleteMany({ where: { funcionalidadId } });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ success: false, error: "Relación no encontrada" }, { status: 404 });
    }
    console.error("[API/db/funcionalidades/[id]/acciones DELETE]", error);
    return NextResponse.json({ success: false, error: "Error al eliminar acción" }, { status: 500 });
  }
}
