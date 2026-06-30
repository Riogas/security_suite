import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  resolveUsuario,
  usuarioPuedeAprobar,
  EFECTO_GRANT,
} from "@/lib/permisos";

// POST /api/db/solicitudes/[id]/aprobar
// Body: { funcionalidadId, fechaDesde?, fechaHasta?, comentario? }
//
// Transacción:
//   1. Valida solicitud PENDIENTE + funcionalidad activa.
//   2. Asegura el vínculo FuncionalidadObjetoAccion (objeto+acción ↔ func).
//   3. Upsert Acceso grant (usuario + funcionalidad).
//   4. Marca la solicitud APROBADA con auditoría.
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
    const funcionalidadId = Number(body.funcionalidadId);
    const fechaDesde = body.fechaDesde ? new Date(body.fechaDesde) : null;
    const fechaHasta = body.fechaHasta ? new Date(body.fechaHasta) : null;
    const comentario = body.comentario ? String(body.comentario).slice(0, 1000) : null;

    if (!Number.isFinite(funcionalidadId) || funcionalidadId <= 0) {
      return NextResponse.json(
        { success: false, error: "funcionalidadId es requerido" },
        { status: 400 },
      );
    }
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
      return NextResponse.json(
        { success: false, error: "fechaDesde debe ser <= fechaHasta" },
        { status: 400 },
      );
    }

    const solicitud = await prisma.solicitudPermiso.findUnique({
      where: { id: solicitudId },
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

    const funcionalidad = await prisma.funcionalidad.findFirst({
      where: { id: funcionalidadId, estado: "A" },
      select: { id: true },
    });
    if (!funcionalidad) {
      return NextResponse.json(
        { success: false, error: "Funcionalidad no encontrada o inactiva" },
        { status: 400 },
      );
    }

    const now = new Date();
    const resultado = await prisma.$transaction(async (tx) => {
      // 2. Asegurar vínculo objeto+acción ↔ funcionalidad
      const vinculoExistente = await tx.funcionalidadObjetoAccion.findFirst({
        where: {
          funcionalidadId,
          objetoId: solicitud.objetoId,
          objetoAccionId: solicitud.objetoAccionId ?? null,
        },
        select: { id: true },
      });
      if (!vinculoExistente) {
        await tx.funcionalidadObjetoAccion.create({
          data: {
            funcionalidadId,
            objetoId: solicitud.objetoId,
            objetoAccionId: solicitud.objetoAccionId ?? null,
          },
        });
      }

      // 3. Upsert Acceso grant
      await tx.acceso.upsert({
        where: {
          funcionalidadId_usuarioId: {
            funcionalidadId,
            usuarioId: solicitud.usuarioId,
          },
        },
        update: {
          efecto: EFECTO_GRANT,
          creadoEn: usuario.username,
          fechaDesde,
          fechaHasta,
        },
        create: {
          funcionalidadId,
          usuarioId: solicitud.usuarioId,
          efecto: EFECTO_GRANT,
          creadoEn: usuario.username,
          fechaDesde,
          fechaHasta,
        },
      });

      // 4. Marcar APROBADA
      const actualizada = await tx.solicitudPermiso.update({
        where: { id: solicitudId },
        data: {
          estado: "APROBADA",
          funcionalidadId,
          resueltaPor: usuario.id,
          fechaResolucion: now,
          comentarioResolucion: comentario,
        },
      });
      return actualizada;
    });

    return NextResponse.json({ success: true, solicitud: resultado, accesoCreado: true });
  } catch (error) {
    console.error("[API/db/solicitudes/[id]/aprobar POST]", error);
    return NextResponse.json(
      { success: false, error: "Error al aprobar la solicitud" },
      { status: 500 },
    );
  }
}
