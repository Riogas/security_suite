import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/acciones?funcionalidadId=&estado=&search=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const funcionalidadId = searchParams.get("funcionalidadId");
    const estado = searchParams.get("estado");
    const search = searchParams.get("search");

    const where: any = {};
    if (estado) where.estado = estado;
    if (search) where.nombre = { contains: search, mode: "insensitive" };

    if (funcionalidadId) {
      // Devuelve acciones que pertenecen a una funcionalidad específica
      const relaciones = await prisma.funcionalidadAccion.findMany({
        where: { funcionalidadId: parseInt(funcionalidadId) },
        include: {
          accion: true,
        },
        orderBy: { accionId: "asc" },
      });
      const acciones = relaciones.map((r) => r.accion);
      return NextResponse.json({ success: true, acciones });
    }

    const acciones = await prisma.accion.findMany({
      where,
      include: {
        funcionalidades: {
          include: {
            funcionalidad: { select: { id: true, nombre: true, aplicacionId: true } },
          },
        },
      },
      orderBy: { id: "asc" },
    });

    return NextResponse.json({ success: true, acciones });
  } catch (error) {
    console.error("[API/db/acciones GET]", error);
    return NextResponse.json({ success: false, error: "Error al listar acciones" }, { status: 500 });
  }
}

// POST /api/db/acciones
// Body: { nombre, descripcion?, estado?, funcionalidadIds?: number[] }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nombre, descripcion, estado, funcionalidadIds } = body;

    if (!nombre) {
      return NextResponse.json({ success: false, error: "nombre es requerido" }, { status: 400 });
    }

    const accion = await prisma.accion.create({
      data: {
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        estado: estado || "A",
        ...(funcionalidadIds?.length
          ? {
              funcionalidades: {
                create: funcionalidadIds.map((fid: number) => ({ funcionalidadId: fid })),
              },
            }
          : {}),
      },
      include: { funcionalidades: true },
    });

    return NextResponse.json({ success: true, accion }, { status: 201 });
  } catch (error) {
    console.error("[API/db/acciones POST]", error);
    return NextResponse.json({ success: false, error: "Error al crear acción" }, { status: 500 });
  }
}
