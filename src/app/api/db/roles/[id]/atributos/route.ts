import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/roles/[id]/atributos — atributos del rol
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rolId = parseInt(id);

    const atributos = await prisma.rolPreferencia.findMany({
      where: { rolId },
      orderBy: { atributo: "asc" },
    });

    return NextResponse.json({ success: true, atributos });
  } catch (error) {
    console.error("[API/db/roles/[id]/atributos GET]", error);
    return NextResponse.json({ success: false, error: "Error al obtener atributos" }, { status: 500 });
  }
}

// PUT /api/db/roles/[id]/atributos — reemplaza todos los atributos del rol
// Body: { atributos: [{ atributo, valor }] }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rolId = parseInt(id);
    const body = await request.json();
    const { atributos } = body; // Array de { atributo, valor }

    // Borrar todos los atributos actuales
    await prisma.rolPreferencia.deleteMany({ where: { rolId } });

    // Crear los nuevos
    if (atributos?.length > 0) {
      await prisma.rolPreferencia.createMany({
        data: atributos.map((a: { atributo: string; valor?: string | null }) => ({
          rolId,
          atributo: a.atributo,
          valor: a.valor ?? null,
        })),
      });
    }

    const atributosActualizados = await prisma.rolPreferencia.findMany({
      where: { rolId },
      orderBy: { atributo: "asc" },
    });

    return NextResponse.json({ success: true, atributos: atributosActualizados });
  } catch (error) {
    console.error("[API/db/roles/[id]/atributos PUT]", error);
    return NextResponse.json({ success: false, error: "Error al guardar atributos" }, { status: 500 });
  }
}

// POST /api/db/roles/[id]/atributos — agregar o actualizar un único atributo
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rolId = parseInt(id);
    const body = await request.json();
    const { atributo, valor } = body;

    if (!atributo) {
      return NextResponse.json({ success: false, error: "atributo es requerido" }, { status: 400 });
    }

    // Upsert: si ya existe el atributo, actualizar; si no, crear
    const existing = await prisma.rolPreferencia.findFirst({
      where: { rolId, atributo },
    });

    let result;
    if (existing) {
      result = await prisma.rolPreferencia.update({
        where: { id: existing.id },
        data: { valor: valor ?? null },
      });
    } else {
      result = await prisma.rolPreferencia.create({
        data: { rolId, atributo, valor: valor ?? null },
      });
    }

    return NextResponse.json({ success: true, atributo: result });
  } catch (error) {
    console.error("[API/db/roles/[id]/atributos POST]", error);
    return NextResponse.json({ success: false, error: "Error al guardar atributo" }, { status: 500 });
  }
}
