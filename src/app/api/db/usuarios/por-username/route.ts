import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/db/usuarios/por-username?username=X
// Devuelve los datos del usuario (tabla `usuarios`) que coincida con el
// username pasado. Match exacto (la columna username es UNIQUE).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = (searchParams.get("username") || "").trim();

    if (!username) {
      return NextResponse.json(
        {
          success: false,
          error: 'El parámetro "username" es requerido. Ej: ?username=jperez',
        },
        { status: 400 },
      );
    }

    const usuario = await prisma.usuario.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        email: true,
        nombre: true,
        apellido: true,
        estado: true,
        fechaCreacion: true,
        fechaBaja: true,
        fechaUltimoLogin: true,
        esExterno: true,
        usuarioExterno: true,
        tipoUsuario: true,
        modificaPermisos: true,
        cambioPassword: true,
        intentosFallidos: true,
        fechaUltimoBloqueo: true,
        telefono: true,
        creadoPor: true,
        desdeSistema: true,
        esRoot: true,
        fechaUltimoPermiso: true,
        observacion: true,
        observacion2: true,
      },
    });

    if (!usuario) {
      return NextResponse.json(
        { success: false, error: "usuario no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, item: usuario });
  } catch (error) {
    console.error("[API/db/usuarios/por-username GET]", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener usuario" },
      { status: 500 },
    );
  }
}
