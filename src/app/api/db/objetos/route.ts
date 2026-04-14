import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/objetos?filtro=&estado=&esPublico=&tipo=&aplicacionId=&page=1&pageSize=20
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filtro = searchParams.get("filtro") || "";
    const estado = searchParams.get("estado") || "";
    const esPublico = searchParams.get("esPublico") || "";
    const tipo = searchParams.get("tipo") || "";
    const aplicacionId = searchParams.get("aplicacionId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "100");
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (estado) where.estado = estado;
    if (esPublico) where.esPublico = esPublico;
    if (tipo) where.tipo = tipo;
    if (aplicacionId) where.aplicacionId = parseInt(aplicacionId);
    if (filtro) {
      where.OR = [
        { key: { contains: filtro, mode: "insensitive" } },
        { label: { contains: filtro, mode: "insensitive" } },
        { path: { contains: filtro, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.objeto.findMany({
        where,
        orderBy: [{ orden: "asc" }, { key: "asc" }],
        skip,
        take: pageSize,
        include: { acciones: true },
      }),
      prisma.objeto.count({ where }),
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
    console.error("[API/db/objetos GET]", error);
    return NextResponse.json({ success: false, error: "Error al listar objetos" }, { status: 500 });
  }
}

// POST /api/db/objetos — crear
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { aplicacionId, tipo, key, label, path, icon, orden, estado, esPublico, parentId, creadoEn, acciones } = body;

    if (!aplicacionId || !tipo || !key) {
      return NextResponse.json({ success: false, error: "aplicacionId, tipo y key son requeridos" }, { status: 400 });
    }

    const objeto = await prisma.objeto.create({
      data: {
        aplicacionId: parseInt(aplicacionId),
        tipo,
        key,
        label: label || null,
        path: path || null,
        icon: icon || null,
        orden: orden ?? 0,
        estado: estado || "A",
        esPublico: esPublico || "N",
        parentId: parentId ? parseInt(parentId) : null,
        creadoEn: creadoEn || null,
        acciones: acciones?.length
          ? {
              create: (acciones as any[]).map((a) => ({
                key: a.key,
                descripcion: a.descripcion || null,
                codigo: a.codigo || null,
                label: a.label || null,
                path: a.path || null,
                icon: a.icon || null,
                relacion: a.relacion ? parseInt(a.relacion) : null,
                creadoEn: a.creadoEn || creadoEn || null,
              })),
            }
          : undefined,
      },
      include: { acciones: true },
    });

    return NextResponse.json({ success: true, objeto }, { status: 201 });
  } catch (error) {
    console.error("[API/db/objetos POST]", error);
    return NextResponse.json({ success: false, error: "Error al crear objeto" }, { status: 500 });
  }
}
