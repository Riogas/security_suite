import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/usuarios/[id]/atributos — preferencias del usuario
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const usuarioId = parseInt(id);

    const atributos = await prisma.usuarioPreferencia.findMany({
      where: { usuarioId },
      orderBy: { atributo: "asc" },
    });

    return NextResponse.json({ success: true, atributos });
  } catch (error) {
    console.error("[API/db/usuarios/[id]/atributos GET]", error);
    return NextResponse.json({ success: false, error: "Error al obtener atributos" }, { status: 500 });
  }
}

// PUT /api/db/usuarios/[id]/atributos — reemplaza todos los atributos del usuario
// Body: { atributos: [{ atributo, valor }] }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const usuarioId = parseInt(id);
    const body = await request.json();
    const { atributos } = body; // Array de { atributo, valor }

    // Borrar todos los atributos actuales
    await prisma.usuarioPreferencia.deleteMany({ where: { usuarioId } });

    // Crear los nuevos
    if (atributos?.length > 0) {
      await prisma.usuarioPreferencia.createMany({
        data: atributos.map((a: any) => ({
          usuarioId,
          atributo: a.atributo,
          valor: a.valor ?? null,
        })),
      });
    }

    const atributosActualizados = await prisma.usuarioPreferencia.findMany({
      where: { usuarioId },
      orderBy: { atributo: "asc" },
    });

    return NextResponse.json({ success: true, atributos: atributosActualizados });
  } catch (error) {
    console.error("[API/db/usuarios/[id]/atributos PUT]", error);
    return NextResponse.json({ success: false, error: "Error al guardar atributos" }, { status: 500 });
  }
}

// POST /api/db/usuarios/[id]/atributos — agregar un único atributo
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const usuarioId = parseInt(id);
    const body = await request.json();
    const { atributo, valor } = body;

    if (!atributo) {
      return NextResponse.json({ success: false, error: "atributo es requerido" }, { status: 400 });
    }

    // Upsert: si ya existe el atributo, actualizar; si no, crear
    const existing = await prisma.usuarioPreferencia.findFirst({
      where: { usuarioId, atributo },
    });

    let result;
    if (existing) {
      result = await prisma.usuarioPreferencia.update({
        where: { id: existing.id },
        data: { valor: valor ?? null },
      });
    } else {
      result = await prisma.usuarioPreferencia.create({
        data: { usuarioId, atributo, valor: valor ?? null },
      });
    }

    return NextResponse.json({ success: true, atributo: result });
  } catch (error) {
    console.error("[API/db/usuarios/[id]/atributos POST]", error);
    return NextResponse.json({ success: false, error: "Error al guardar atributo" }, { status: 500 });
  }
}
