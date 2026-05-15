import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/usuarios/por-empresa-fletera
// Query params:
//   empresas  — requerido, comma-separated list of fletera company names/codes
//               e.g. ?empresas=FLETERA_1,FLETERA_2
//   estado    — opcional (A | I | "" para todos). Default: "" (todos)
//
// Lógica:
//   UsuarioPreferencia almacena atributo="EmpFletera" con valor=<JSON o string con empresas>.
//   Se filtra con ILIKE "%empresa%" por cada empresa pedida (OR entre empresas).
//   Un usuario aparece si al menos una de sus preferencias EmpFletera contiene alguna empresa.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const empresasParam = searchParams.get("empresas") || "";
    if (!empresasParam.trim()) {
      return NextResponse.json(
        {
          success: false,
          error:
            'El parámetro "empresas" es requerido. Ej: ?empresas=FLETERA_1,FLETERA_2',
        },
        { status: 400 },
      );
    }

    const empresas = empresasParam
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    if (empresas.length === 0) {
      return NextResponse.json(
        { success: false, error: "Lista de empresas vacía" },
        { status: 400 },
      );
    }

    const estado = searchParams.get("estado") || "";

    // Buscar IDs de usuarios que tengan EmpFletera conteniendo al menos una empresa (OR)
    const preferencias = await prisma.usuarioPreferencia.findMany({
      where: {
        atributo: "EmpFletera",
        OR: empresas.map((empresa) => ({
          valor: { contains: empresa, mode: "insensitive" as const },
        })),
      },
      select: { usuarioId: true },
      distinct: ["usuarioId"],
    });

    const usuarioIds = preferencias.map((p) => p.usuarioId);

    if (usuarioIds.length === 0) {
      return NextResponse.json({
        success: true,
        items: [],
        total: 0,
        empresasFiltradas: empresas,
      });
    }

    // Construir where para el usuario
    const whereUsuario: any = { id: { in: usuarioIds } };
    if (estado === "A" || estado === "I") {
      whereUsuario.estado = estado;
    }

    const usuarios = await prisma.usuario.findMany({
      where: whereUsuario,
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
      select: {
        id: true,
        username: true,
        email: true,
        nombre: true,
        apellido: true,
        estado: true,
        tipoUsuario: true,
        esExterno: true,
        telefono: true,
        fechaCreacion: true,
        fechaUltimoLogin: true,
      },
    });

    return NextResponse.json({
      success: true,
      items: usuarios,
      total: usuarios.length,
      empresasFiltradas: empresas,
    });
  } catch (error) {
    console.error("[API/db/usuarios/por-empresa-fletera GET]", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener usuarios" },
      { status: 500 },
    );
  }
}
