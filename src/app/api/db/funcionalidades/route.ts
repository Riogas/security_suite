import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/funcionalidades?aplicacionId=&filtro=&estado=&page=1&pageSize=100
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
    if (filtro) where.nombre = { contains: filtro, mode: "insensitive" };

    const [items, total] = await Promise.all([
      prisma.funcionalidad.findMany({
        where,
        orderBy: { nombre: "asc" },
        skip,
        take: pageSize,
        include: {
          aplicacion: { select: { id: true, nombre: true } },
          acciones: { include: { accion: { select: { id: true, nombre: true } } } },
          _count: { select: { objetoAcciones: true } },
        },
      }),
      prisma.funcionalidad.count({ where }),
    ]);

    return NextResponse.json({ success: true, items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    console.error("[API/db/funcionalidades GET]", error);
    return NextResponse.json({ success: false, error: "Error al listar funcionalidades" }, { status: 500 });
  }
}

// POST /api/db/funcionalidades — crear
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { aplicacionId, nombre, estado, esPublico, soloRoot, objetoKey, accionKey, fechaDesde, fechaHasta, acciones } = body;

    if (!aplicacionId || !nombre) {
      return NextResponse.json({ success: false, error: "aplicacionId y nombre son requeridos" }, { status: 400 });
    }

    const funcionalidad = await prisma.funcionalidad.create({
      data: {
        aplicacionId: parseInt(aplicacionId),
        nombre,
        estado: estado || "A",
        esPublico: esPublico || "N",
        soloRoot: soloRoot || "N",
        objetoKey: objetoKey || null,
        accionKey: accionKey || null,
        fechaDesde: fechaDesde ? new Date(fechaDesde) : null,
        fechaHasta: fechaHasta ? new Date(fechaHasta) : null,
        acciones: acciones?.length
          ? {
              create: acciones.map((a: any) => ({
                accionId: parseInt(a.accionId),
              })),
            }
          : undefined,
      },
    });

    return NextResponse.json({ success: true, funcionalidad }, { status: 201 });
  } catch (error) {
    console.error("[API/db/funcionalidades POST]", error);
    return NextResponse.json({ success: false, error: "Error al crear funcionalidad" }, { status: 500 });
  }
}
