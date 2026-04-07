import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "security-suite-secret-key";

// Mapeo path → funcionalidad key (igual que en el sidebar)
const PATH_TO_FUNC: Record<string, string> = {
  "/usuarios":        "usuarios",
  "/roles":           "roles",
  "/aplicaciones":    "aplicaciones",
  "/funcionalidades": "funcionalidades",
  "/accesos":         "accesos",
  "/objetos":         "objetos",
};

function pathToFuncKey(objetoPath: string): string | null {
  // "/dashboard/usuarios" → "/usuarios" → "usuarios"
  const clean = objetoPath.startsWith("/dashboard")
    ? objetoPath.slice("/dashboard".length)
    : objetoPath;
  // tomar el primer segmento
  const firstSegment = "/" + (clean.split("/").filter(Boolean)[0] || "");
  return PATH_TO_FUNC[firstSegment] ?? null;
}

/**
 * POST /api/db/permisos
 * Verifica si el usuario tiene acceso a un path/funcionalidad.
 *
 * Body (compatible con el formato que envía el middleware):
 * {
 *   AplicacionId?: number,
 *   ObjetoKey?: string,
 *   ObjetoPath?: string,   // e.g. "/usuarios" o "/dashboard/usuarios"
 *   ObjetoTipo?: string,
 *   AccionKey?: string,
 *   AccionCodigo?: string
 * }
 *
 * Auth: Bearer <JWT> en Authorization header
 *
 * Respuesta: { Permitido: boolean, allowed: boolean, via: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { AplicacionId, ObjetoKey, ObjetoPath } = body;

    // Extraer token del header o cookie
    const authHeader = request.headers.get("authorization") || "";
    const cookieToken = request.cookies.get("token")?.value;
    const rawToken = authHeader.replace("Bearer ", "") || cookieToken || "";

    if (!rawToken) {
      return NextResponse.json(
        { Permitido: false, allowed: false, message: "Sin autenticación" },
        { status: 401 },
      );
    }

    // Verificar y decodificar JWT
    let decoded: any;
    try {
      decoded = jwt.verify(rawToken, JWT_SECRET);
    } catch {
      return NextResponse.json(
        { Permitido: false, allowed: false, message: "Token inválido" },
        { status: 401 },
      );
    }

    const userId: number = decoded.userId;
    const isRoot = decoded.isRoot === "S";

    // Root siempre tiene acceso
    if (isRoot) {
      return NextResponse.json({ Permitido: true, allowed: true, ok: true, via: "root" });
    }

    // Verificar si el usuario existe y está activo
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { estado: true, esRoot: true },
    });

    if (!usuario || usuario.estado !== "A") {
      return NextResponse.json({ Permitido: false, allowed: false, message: "Usuario inactivo" });
    }

    if (usuario.esRoot === "S") {
      return NextResponse.json({ Permitido: true, allowed: true, ok: true, via: "root" });
    }

    // Determinar la funcionalidad a chequear
    const funcKey = pathToFuncKey(ObjetoPath || `/${ObjetoKey || ""}`) || ObjetoKey;

    if (!funcKey) {
      // Path no mapeado → permitir (ruta sin restricción)
      return NextResponse.json({ Permitido: true, allowed: true, ok: true, via: "unmapped" });
    }

    const aplicacionId = Number(
      AplicacionId || process.env.NEXT_PUBLIC_APLICACION_ID || process.env.APLICACION_ID || 0,
    );

    // Buscar la funcionalidad por nombre
    const funcionalidad = await prisma.funcionalidad.findFirst({
      where: {
        nombre: { equals: funcKey, mode: "insensitive" },
        estado: "A",
        ...(aplicacionId ? { aplicacionId } : {}),
      },
      select: { id: true, esPublico: true, soloRoot: true },
    });

    if (!funcionalidad) {
      // Funcionalidad no registrada en DB → permitir (no bloqueamos lo que no conocemos)
      return NextResponse.json({ Permitido: true, allowed: true, ok: true, via: "not-registered" });
    }

    // Funcionalidad pública → siempre permitida
    if (funcionalidad.esPublico === "S") {
      return NextResponse.json({ Permitido: true, allowed: true, ok: true, via: "public" });
    }

    // soloRoot → deniega si no es root
    if (funcionalidad.soloRoot === "S") {
      return NextResponse.json({ Permitido: false, allowed: false, message: "Solo root" });
    }

    // Chequear acceso directo
    const accesoDirecto = await prisma.acceso.findFirst({
      where: {
        usuarioId: userId,
        funcionalidadId: funcionalidad.id,
        efecto: "ALLOW",
        OR: [
          { fechaHasta: null },
          { fechaHasta: { gte: new Date() } },
        ],
      },
    });

    if (accesoDirecto) {
      return NextResponse.json({ Permitido: true, allowed: true, ok: true, via: "direct-access" });
    }

    // Chequear acceso vía roles
    const rolesUsuario = await prisma.usuarioRol.findMany({
      where: {
        usuarioId: userId,
        OR: [
          { fechaHasta: null },
          { fechaHasta: { gte: new Date() } },
        ],
      },
      select: { rolId: true },
    });

    if (rolesUsuario.length > 0) {
      const rolIds = rolesUsuario.map((r) => r.rolId);
      const rolConAcceso = await prisma.rolFuncionalidad.findFirst({
        where: {
          funcionalidadId: funcionalidad.id,
          rolId: { in: rolIds },
        },
      });

      if (rolConAcceso) {
        return NextResponse.json({ Permitido: true, allowed: true, ok: true, via: "role" });
      }
    }

    // Sin acceso
    return NextResponse.json({ Permitido: false, allowed: false, message: "Sin permisos" });
  } catch (error) {
    console.error("[API/db/permisos POST]", error);
    return NextResponse.json({ success: false, error: "Error al verificar permisos" }, { status: 500 });
  }
}
