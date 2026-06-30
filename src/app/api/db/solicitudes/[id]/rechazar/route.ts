import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveUsuario, usuarioPuedeAprobar } from "@/lib/permisos";

// POST /api/db/solicitudes/[id]/rechazar
// Body: { comentario? }
// Marca la solicitud RECHAZADA. No crea ningún acceso.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const usuario = await resolveUsuario(request);
    if (!usuario) {
      return NextResponse.json({ success: false, error: "NO_AUTORIZADO" }, { status: 401 });
    }
    if (!(await usuarioPuedeAprobar(usuario))) {
      return NextResponse.json({ success: false, error: "SIN_PERMISO_APROBAR" }, { status: 403 });
    }

    const { id } = await params;
    const solicitudId = parseInt(id);
    if (isNaN(solicitudId)) {
      return NextResponse.json({ success: false, error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const comentario = body.comentario ? String(body.comentario).slice(0, 1000) : null;

    const solicitud = await prisma.solicitudPermiso.findUnique({
      where: { id: solicitudId },
      select: { id: true, estado: true },
    });
    if (!solicitud) {
      return NextResponse.json({ success: false, error: "Solicitud no encontrada" }, { status: 404 });
    }
    if (solicitud.estado !== "PENDIENTE") {
      return NextResponse.json(
        { success: false, error: `La solicitud ya está ${solicitud.estado}` },
        { status: 409 },
      );
    }

    const actualizada = await prisma.solicitudPermiso.update({
      where: { id: solicitudId },
      data: {
        estado: "RECHAZADA",
        resueltaPor: usuario.id,
        fechaResolucion: new Date(),
        comentarioResolucion: comentario,
      },
    });

    return NextResponse.json({ success: true, solicitud: actualizada });
  } catch (error) {
    console.error("[API/db/solicitudes/[id]/rechazar POST]", error);
    return NextResponse.json(
      { success: false, error: "Error al rechazar la solicitud" },
      { status: 500 },
    );
  }
}
