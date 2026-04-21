import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/aplicaciones?filtro=&estado=&page=1&pageSize=20
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filtro = searchParams.get("filtro") || "";
    const estado = searchParams.get("estado") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "100");
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (estado) where.estado = estado;
    if (filtro) {
      where.OR = [
        { nombre: { contains: filtro, mode: "insensitive" } },
        { descripcion: { contains: filtro, mode: "insensitive" } },
        { tecnologia: { contains: filtro, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.aplicacion.findMany({
        where,
        orderBy: { nombre: "asc" },
        skip,
        take: pageSize,
      }),
      prisma.aplicacion.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("[API/db/aplicaciones GET]", error);
    return NextResponse.json({ success: false, error: "Error al listar aplicaciones" }, { status: 500 });
  }
}

// POST /api/db/aplicaciones — crear
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nombre, descripcion, estado, url, tecnologia, sistemaId } = body;

    if (!nombre) {
      return NextResponse.json({ success: false, error: "nombre es requerido" }, { status: 400 });
    }

    const aplicacion = await prisma.aplicacion.create({
      data: {
        nombre,
        descripcion: descripcion || null,
        estado: estado || "A",
        url: url || null,
        tecnologia: tecnologia || null,
        sistemaId: sistemaId ? parseInt(sistemaId) : null,
      },
    });

    return NextResponse.json({ success: true, aplicacion }, { status: 201 });
  } catch (error) {
    console.error("[API/db/aplicaciones POST]", error);
    return NextResponse.json({ success: false, error: "Error al crear aplicación" }, { status: 500 });
  }
}
