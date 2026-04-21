import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// =============================================
// GET /api/db/usuarios - Listar usuarios locales (PostgreSQL)
// Query params: filtro, estado, page, pageSize
// =============================================
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filtro = searchParams.get("filtro") || "";
    const estado = searchParams.get("estado") || ""; // A, I, o vacío para todos
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.max(1, parseInt(searchParams.get("pageSize") || "10"));

    // Construir where dinámico
    const where: any = {};

    if (estado === "A" || estado === "S") {
      where.estado = "A";
    } else if (estado === "I" || estado === "N") {
      where.estado = "I";
    }

    if (filtro) {
      where.OR = [
        { username: { contains: filtro, mode: "insensitive" } },
        { nombre: { contains: filtro, mode: "insensitive" } },
        { apellido: { contains: filtro, mode: "insensitive" } },
        { email: { contains: filtro, mode: "insensitive" } },
        { telefono: { contains: filtro, mode: "insensitive" } },
      ];
    }

    const [usuarios, total] = await Promise.all([
      prisma.usuario.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: "asc" },
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
      }),
      prisma.usuario.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      items: usuarios,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    console.error("[API /db/usuarios GET] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

// =============================================
// POST /api/db/usuarios - Crear usuario en PostgreSQL
// =============================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validaciones mínimas
    if (!body.username || !body.password) {
      return NextResponse.json(
        { success: false, error: "Username y password son requeridos" },
        { status: 400 },
      );
    }

    // Verificar si ya existe
    const existing = await prisma.usuario.findUnique({
      where: { username: body.username },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "El usuario ya existe" },
        { status: 409 },
      );
    }

    const usuario = await prisma.usuario.create({
      data: {
        username: body.username,
        password: body.password, // El hash bcrypt se debería hacer antes de enviar o aquí
        email: body.email || null,
        nombre: body.nombre || null,
        apellido: body.apellido || null,
        estado: body.estado || "A",
        telefono: body.telefono || null,
        tipoUsuario: body.tipoUsuario || "L",
        esExterno: body.esExterno || "N",
        usuarioExterno: body.usuarioExterno || null,
        esRoot: body.esRoot || "N",
        desdeSistema: body.desdeSistema || "N",
        modificaPermisos: body.modificaPermisos || "N",
        cambioPassword: body.cambioPassword || "N",
        creadoPor: body.creadoPor || null,
        observacion: body.observacion || null,
        observacion2: body.observacion2 || null,
      },
    });

    return NextResponse.json({
      success: true,
      usuario: { ...usuario, password: undefined },
    });
  } catch (error: any) {
    console.error("[API /db/usuarios POST] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
