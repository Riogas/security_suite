import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/roles?aplicacionId=&estado=&filtro=&page=1&pageSize=100
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filtro = searchParams.get("filtro") || "";
    const estado = searchParams.get("estado") || "";
    const aplicacionId = searchParams.get("aplicacionId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "100");
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (estado) where.estado = estado;
    if (aplicacionId) where.aplicacionId = parseInt(aplicacionId);
    if (filtro) {
      where.OR = [
        { nombre: { contains: filtro, mode: "insensitive" } },
        { descripcion: { contains: filtro, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.rol.findMany({
        where,
        orderBy: { nombre: "asc" },
        skip,
        take: pageSize,
        include: { aplicacion: { select: { id: true, nombre: true } } },
      }),
      prisma.rol.count({ where }),
    ]);

    return NextResponse.json({ success: true, items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    console.error("[API/db/roles GET]", error);
    return NextResponse.json({ success: false, error: "Error al listar roles" }, { status: 500 });
  }
}

// POST /api/db/roles — crear
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { aplicacionId, nombre, descripcion, estado, nivel, creadoEn, funcionalidades } = body;

    if (!aplicacionId || !nombre) {
      return NextResponse.json({ success: false, error: "aplicacionId y nombre son requeridos" }, { status: 400 });
    }

    const rol = await prisma.rol.create({
      data: {
        aplicacionId: parseInt(aplicacionId),
        nombre,
        descripcion: descripcion || null,
        estado: estado || "A",
        nivel: nivel ?? 0,
        creadoEn: creadoEn || null,
        // Asociar funcionalidades si se pasan
        funcionalidades: funcionalidades?.length
          ? {
              create: funcionalidades.map((f: any) => ({
                funcionalidadId: parseInt(f.funcionalidadId),
              })),
            }
          : undefined,
      },
    });

    return NextResponse.json({ success: true, rol }, { status: 201 });
  } catch (error) {
    console.error("[API/db/roles POST]", error);
    return NextResponse.json({ success: false, error: "Error al crear rol" }, { status: 500 });
  }
}
