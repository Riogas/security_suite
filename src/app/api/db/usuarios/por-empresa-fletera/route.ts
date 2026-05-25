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

    // Buscar usuarios que tengan EmpFletera conteniendo al menos una empresa (OR)
    const preferencias = await prisma.usuarioPreferencia.findMany({
      where: {
        atributo: "EmpFletera",
        OR: empresas.map((empresa) => ({
          valor: { contains: empresa, mode: "insensitive" as const },
        })),
      },
      select: { usuarioId: true, valor: true },
    });

    // Map usuarioId -> EmpFletera (parsed si es JSON válido, raw si no)
    const empFleteraByUsuario = new Map<number, unknown>();
    for (const p of preferencias) {
      if (empFleteraByUsuario.has(p.usuarioId)) continue;
      let parsed: unknown = p.valor;
      try {
        parsed = p.valor ? JSON.parse(p.valor) : p.valor;
      } catch {
        // valor no es JSON — devolver string crudo
      }
      empFleteraByUsuario.set(p.usuarioId, parsed);
    }

    const usuarioIds = Array.from(empFleteraByUsuario.keys());

    // habilitado = true si el usuario tiene PermiteLogin via cualquiera de:
    //   (a) algún rol activo con la funcionalidad "PermiteLogin" (RolFuncionalidad)
    //   (b) acceso directo en la tabla `accesos` (Acceso) con efecto distinto de "deny"
    const habilitadoByUsuario = new Map<number, boolean>();
    if (usuarioIds.length > 0) {
      // (a) via rol
      const rolesConPermiteLogin = await prisma.rolFuncionalidad.findMany({
        where: {
          funcionalidad: { nombre: "PermiteLogin" },
          rol: { estado: "A" },
        },
        select: { rolId: true },
      });
      const permiteLoginRolIds = new Set(
        rolesConPermiteLogin.map((r) => r.rolId),
      );

      const userRoles = await prisma.usuarioRol.findMany({
        where: { usuarioId: { in: usuarioIds } },
        select: { usuarioId: true, rolId: true },
      });

      for (const ur of userRoles) {
        if (permiteLoginRolIds.has(ur.rolId)) {
          habilitadoByUsuario.set(ur.usuarioId, true);
        } else if (!habilitadoByUsuario.has(ur.usuarioId)) {
          habilitadoByUsuario.set(ur.usuarioId, false);
        }
      }

      // (b) via acceso directo
      const accesosDirectos = await prisma.acceso.findMany({
        where: {
          funcionalidad: { nombre: "PermiteLogin" },
          usuarioId: { in: usuarioIds },
        },
        select: { usuarioId: true, efecto: true },
      });

      for (const a of accesosDirectos) {
        if (a.efecto?.toLowerCase() !== "deny") {
          habilitadoByUsuario.set(a.usuarioId, true);
        }
      }
    }

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

    const items = usuarios.map((u) => ({
      ...u,
      empFletera: empFleteraByUsuario.get(u.id) ?? null,
      habilitado: habilitadoByUsuario.get(u.id) ?? false,
    }));

    return NextResponse.json({
      success: true,
      items,
      total: items.length,
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
