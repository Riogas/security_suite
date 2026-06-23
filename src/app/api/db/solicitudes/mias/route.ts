import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveUsuario } from "@/lib/permisos";

// GET /api/db/solicitudes/mias
// Devuelve las solicitudes del usuario autenticado (para ver su estado).
export async function GET(request: NextRequest) {
  try {
    const usuario = await resolveUsuario(request);
    if (!usuario) {
      return NextResponse.json(
        { success: false, error: "NO_AUTORIZADO" },
        { status: 401 },
      );
    }

    const items = await prisma.solicitudPermiso.findMany({
      where: { usuarioId: usuario.id },
      orderBy: { fechaCreacion: "desc" },
      include: {
        objeto: { select: { key: true, label: true, tipo: true, path: true } },
        aplicacion: { select: { nombre: true } },
        funcionalidad: { select: { nombre: true } },
      },
    });

    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error("[API/db/solicitudes/mias GET]", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener tus solicitudes" },
      { status: 500 },
    );
  }
}
