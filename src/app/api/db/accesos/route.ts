import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/accesos?usuarioId=&aplicacionId=&funcionalidadId=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const usuarioId = searchParams.get("usuarioId");
    const aplicacionId = searchParams.get("aplicacionId");
    const funcionalidadId = searchParams.get("funcionalidadId");

    const where: any = {};
    if (usuarioId) where.usuarioId = parseInt(usuarioId);
    if (funcionalidadId) where.funcionalidadId = parseInt(funcionalidadId);
    if (aplicacionId) {
      where.funcionalidad = { aplicacionId: parseInt(aplicacionId) };
    }

    const accesos = await prisma.acceso.findMany({
      where,
      include: {
        funcionalidad: {
          include: { aplicacion: { select: { id: true, nombre: true } } },
        },
        usuario: { select: { id: true, username: true, nombre: true, apellido: true } },
      },
      orderBy: { funcionalidadId: "asc" },
    });

    return NextResponse.json({ success: true, accesos });
  } catch (error) {
    console.error("[API/db/accesos GET]", error);
    return NextResponse.json({ success: false, error: "Error al listar accesos" }, { status: 500 });
  }
}

// POST /api/db/accesos — upsert de un acceso individual
// Body: { usuarioId, funcionalidadId, efecto?, creadoEn?, fechaDesde?, fechaHasta? }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { usuarioId, funcionalidadId, efecto, creadoEn, fechaDesde, fechaHasta } = body;

    if (!usuarioId || !funcionalidadId) {
      return NextResponse.json({ success: false, error: "usuarioId y funcionalidadId son requeridos" }, { status: 400 });
    }

    // Upsert: crear si no existe, actualizar si existe
    const acceso = await prisma.acceso.upsert({
      where: {
        funcionalidadId_usuarioId: {
          funcionalidadId: parseInt(funcionalidadId),
          usuarioId: parseInt(usuarioId),
        },
      },
      update: {
        efecto: efecto || "ALLOW",
        creadoEn: creadoEn || null,
        fechaDesde: fechaDesde ? new Date(fechaDesde) : null,
        fechaHasta: fechaHasta ? new Date(fechaHasta) : null,
      },
      create: {
        funcionalidadId: parseInt(funcionalidadId),
        usuarioId: parseInt(usuarioId),
        efecto: efecto || "ALLOW",
        creadoEn: creadoEn || null,
        fechaDesde: fechaDesde ? new Date(fechaDesde) : null,
        fechaHasta: fechaHasta ? new Date(fechaHasta) : null,
      },
    });

    return NextResponse.json({ success: true, acceso }, { status: 201 });
  } catch (error) {
    console.error("[API/db/accesos POST]", error);
    return NextResponse.json({ success: false, error: "Error al guardar acceso" }, { status: 500 });
  }
}

// DELETE /api/db/accesos?usuarioId=&funcionalidadId=
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const usuarioId = parseInt(searchParams.get("usuarioId") || "0");
    const funcionalidadId = parseInt(searchParams.get("funcionalidadId") || "0");

    if (!usuarioId || !funcionalidadId) {
      return NextResponse.json({ success: false, error: "usuarioId y funcionalidadId son requeridos" }, { status: 400 });
    }

    await prisma.acceso.delete({
      where: { funcionalidadId_usuarioId: { funcionalidadId, usuarioId } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API/db/accesos DELETE]", error);
    return NextResponse.json({ success: false, error: "Error al eliminar acceso" }, { status: 500 });
  }
}
