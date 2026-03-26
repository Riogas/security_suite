import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// =============================================
// GET /api/db/usuarios/[id] - Obtener un usuario por ID
// =============================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json(
        { success: false, error: "ID inválido" },
        { status: 400 },
      );
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            rol: {
              include: { aplicacion: true },
            },
          },
        },
        preferencias: true,
      },
    });

    if (!usuario) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      usuario: { ...usuario, password: undefined },
    });
  } catch (error: any) {
    console.error("[API /db/usuarios/[id] GET] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

// =============================================
// PUT /api/db/usuarios/[id] - Actualizar un usuario
// =============================================
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json(
        { success: false, error: "ID inválido" },
        { status: 400 },
      );
    }

    const body = await req.json();

    // Verificar que existe
    const existing = await prisma.usuario.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 },
      );
    }

    // Construir data de actualización (solo campos enviados)
    const updateData: any = {};

    if (body.email !== undefined) updateData.email = body.email || null;
    if (body.nombre !== undefined) updateData.nombre = body.nombre || null;
    if (body.apellido !== undefined) updateData.apellido = body.apellido || null;
    if (body.estado !== undefined) updateData.estado = body.estado;
    if (body.telefono !== undefined) updateData.telefono = body.telefono || null;
    if (body.tipoUsuario !== undefined) updateData.tipoUsuario = body.tipoUsuario;
    if (body.esExterno !== undefined) updateData.esExterno = body.esExterno;
    if (body.usuarioExterno !== undefined) updateData.usuarioExterno = body.usuarioExterno || null;
    if (body.esRoot !== undefined) updateData.esRoot = body.esRoot;
    if (body.desdeSistema !== undefined) updateData.desdeSistema = body.desdeSistema;
    if (body.modificaPermisos !== undefined) updateData.modificaPermisos = body.modificaPermisos;
    if (body.cambioPassword !== undefined) updateData.cambioPassword = body.cambioPassword;
    if (body.observacion !== undefined) updateData.observacion = body.observacion || null;
    if (body.observacion2 !== undefined) updateData.observacion2 = body.observacion2 || null;
    if (body.fechaBaja !== undefined) updateData.fechaBaja = body.fechaBaja ? new Date(body.fechaBaja) : null;

    // Password: solo actualizar si se envía y no es el placeholder
    if (body.password && body.password !== "********") {
      updateData.password = body.password;
    }

    const usuario = await prisma.usuario.update({
      where: { id: userId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      usuario: { ...usuario, password: undefined },
    });
  } catch (error: any) {
    console.error("[API /db/usuarios/[id] PUT] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

// =============================================
// DELETE /api/db/usuarios/[id] - Eliminar (o desactivar) un usuario
// =============================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json(
        { success: false, error: "ID inválido" },
        { status: 400 },
      );
    }

    // Soft delete: cambiar estado a Inactivo y poner fecha de baja
    const usuario = await prisma.usuario.update({
      where: { id: userId },
      data: {
        estado: "I",
        fechaBaja: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Usuario desactivado correctamente",
      usuario: { id: usuario.id, estado: usuario.estado },
    });
  } catch (error: any) {
    console.error("[API /db/usuarios/[id] DELETE] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
