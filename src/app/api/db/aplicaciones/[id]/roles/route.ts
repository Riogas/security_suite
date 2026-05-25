import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/aplicaciones/[id]/roles
// Query params: estado (A | I | "" para todos)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const aplicacionId = parseInt(id);

    if (isNaN(aplicacionId)) {
      return NextResponse.json(
        { success: false, error: "id inválido" },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(req.url);
    const estado = searchParams.get("estado") || "";

    const where: any = { aplicacionId };
    if (estado === "A" || estado === "I") {
      where.estado = estado;
    }

    const roles = await prisma.rol.findMany({
      where,
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        estado: true,
        nivel: true,
        fechaCreacion: true,
        creadoEn: true,
      },
    });

    return NextResponse.json({ success: true, roles, total: roles.length });
  } catch (error) {
    console.error("[API/db/aplicaciones/[id]/roles GET]", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener roles" },
      { status: 500 },
    );
  }
}
