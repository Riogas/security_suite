import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/db/roles/[id]/clonar — clonar un rol existente
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rolId = parseInt(id);

    if (isNaN(rolId)) {
      return NextResponse.json(
        { success: false, error: "ID de rol inválido" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { nombre } = body;

    if (!nombre || typeof nombre !== "string" || nombre.trim() === "") {
      return NextResponse.json(
        { success: false, error: "El nombre del nuevo rol es obligatorio" },
        { status: 400 }
      );
    }

    const nombreNuevo = nombre.trim();

    // Leer el rol original con funcionalidades y preferencias
    const rolOriginal = await prisma.rol.findUnique({
      where: { id: rolId },
      include: {
        funcionalidades: true,
        preferencias: true,
      },
    });

    if (!rolOriginal) {
      return NextResponse.json(
        { success: false, error: "Rol original no encontrado" },
        { status: 404 }
      );
    }

    // Verificar unicidad: no puede existir otro rol con mismo nombre en la misma aplicación
    const existente = await prisma.rol.findFirst({
      where: {
        aplicacionId: rolOriginal.aplicacionId,
        nombre: { equals: nombreNuevo, mode: "insensitive" },
      },
    });

    if (existente) {
      return NextResponse.json(
        { success: false, error: "El nombre ya existe para esta aplicación" },
        { status: 409 }
      );
    }

    // Crear el nuevo rol clonado con sus relaciones
    const nuevoRol = await prisma.rol.create({
      data: {
        aplicacionId: rolOriginal.aplicacionId,
        nombre: nombreNuevo,
        descripcion: rolOriginal.descripcion,
        estado: rolOriginal.estado,
        nivel: rolOriginal.nivel,
        // Copiar funcionalidades (RolFuncionalidad)
        funcionalidades: rolOriginal.funcionalidades.length
          ? {
              create: rolOriginal.funcionalidades.map((f) => ({
                funcionalidadId: f.funcionalidadId,
              })),
            }
          : undefined,
        // Copiar preferencias/atributos (RolPreferencia)
        preferencias: rolOriginal.preferencias.length
          ? {
              create: rolOriginal.preferencias.map((p) => ({
                atributo: p.atributo,
                valor: p.valor,
              })),
            }
          : undefined,
      },
      include: {
        aplicacion: { select: { id: true, nombre: true } },
      },
    });

    return NextResponse.json({ success: true, rol: nuevoRol }, { status: 201 });
  } catch (error: any) {
    // Capturar error de unicidad de Prisma (segunda capa de protección)
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "El nombre ya existe para esta aplicación" },
        { status: 409 }
      );
    }
    console.error("[API/db/roles/[id]/clonar POST]", error);
    return NextResponse.json(
      { success: false, error: "Error al clonar el rol" },
      { status: 500 }
    );
  }
}
