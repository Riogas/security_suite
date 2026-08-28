import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiAuth } from "@/lib/auth/apiGuard";

// =============================================
// GET /api/db/usuarios - Listar usuarios locales (PostgreSQL)
// Query params: filtro, estado, page, pageSize
// =============================================
export async function GET(req: NextRequest) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Antes esto no chequeaba nada.
  const guard = await requireApiAuth(req);
  if (!guard.ok) return guard.respuesta;

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
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Antes esto no chequeaba nada.
  const guard = await requireApiAuth(req);
  if (!guard.ok) return guard.respuesta;

  try {
    const body = await req.json();

    // Validaciones mínimas
    if (!body.username || !body.password) {
      return NextResponse.json(
        { success: false, error: "Username y password son requeridos" },
        { status: 400 },
      );
    }

    // `esRoot` ya no otorga nada: root se resuelve por el ROL "Root" de cada
    // aplicación (src/lib/permisos.ts). Antes acá se exigía ser root para poder
    // mandar `esRoot='S'`, porque esa columna ERA el bypass del motor. Ahora el
    // chequeo no tendría sentido: aunque el campo se guardara, el usuario creado
    // no sería root de nada.
    //
    // Se RECHAZA en vez de ignorarlo en silencio. Aceptarlo y guardar la 'S'
    // dejaría al administrador convencido de que otorgó privilegios que no
    // otorgó — que es exactamente el problema que se viene a sacar del formulario.
    // Mandar 'N' (o no mandar nada) sigue siendo válido: así no se rompe ningún
    // cliente que hoy manda el campo con su valor por defecto.
    if (String(body.esRoot ?? "N").toUpperCase() === "S") {
      return NextResponse.json(
        {
          success: false,
          error:
            "El campo `esRoot` ya no otorga privilegios. Para hacer root a un usuario, " +
            "asignale el rol \"Root\" de la aplicación que corresponda (PUT /api/db/usuarios/:id/roles).",
        },
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
        // La columna se queda en el schema pero no autoriza: los usuarios nuevos
        // nacen en 'N' y root se otorga asignando el rol.
        esRoot: "N",
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
