import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// =====================================================================
// POST /api/db/permisos
// Drop-in replacement de la API de GeneXus para verificar permisos.
//
// Body: { AplicacionId, ObjetoKey, ObjetoTipo, AccionKey, AccionCodigo?, ObjetoPath? }
// Auth: Bearer <token> (header) o cookie "token"
//
// Response (compatible con middleware y apiValidarPermiso):
//   { Permitido: boolean, permitido: boolean, allowed: boolean, ok: boolean, reason?: string }
// =====================================================================

/** Decodifica JWT sin verificar firma — igual que el middleware Edge */
function decodeJwt(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return req.cookies.get("token")?.value ?? null;
}

export async function POST(request: NextRequest) {
  const denyWith = (reason: string, status = 200) =>
    NextResponse.json({ Permitido: false, permitido: false, allowed: false, ok: false, reason }, { status });

  const allowWith = (reason = "OK") =>
    NextResponse.json({ Permitido: true, permitido: true, allowed: true, ok: true, reason });

  try {
    const body = await request.json();
    const {
      AplicacionId,
      ObjetoKey,
      AccionKey,
    } = body as {
      AplicacionId?: number | string;
      ObjetoKey?: string;
      ObjetoTipo?: string;
      AccionKey?: string;
      AccionCodigo?: string;
      ObjetoPath?: string;
    };

    if (!AplicacionId || !ObjetoKey || !AccionKey) {
      return denyWith("MISSING_PARAMS");
    }

    const aplicacionId = Number(AplicacionId);
    const objetoKey = String(ObjetoKey).trim();
    const accionKey = String(AccionKey).trim().toLowerCase();

    // ── 1. JWT ────────────────────────────────────────────────────────
    const token = extractToken(request);
    if (!token) return denyWith("NO_TOKEN", 401);

    const payload = decodeJwt(token);
    if (!payload) return denyWith("INVALID_TOKEN", 401);

    const rawUsername =
      payload.username ?? payload.sub ?? payload.name ??
      payload.email ?? payload.preferred_username ?? null;

    if (!rawUsername) return denyWith("NO_USERNAME_IN_TOKEN");

    const usernameStr = String(rawUsername).trim();

    // ── 2. Usuario ────────────────────────────────────────────────────
    const usuario = await prisma.usuario.findFirst({
      where: {
        OR: [
          { username: { equals: usernameStr, mode: "insensitive" } },
          { email:    { equals: usernameStr, mode: "insensitive" } },
        ],
        estado: "A",
      },
      select: { id: true, esRoot: true },
    });

    if (!usuario) return denyWith("USER_NOT_FOUND");

    // ── 3. Root siempre permite ───────────────────────────────────────
    if (usuario.esRoot === "S") return allowWith("ROOT");

    // ── 4. Objeto público → permite sin más checks ────────────────────
    const objeto = await prisma.objeto.findFirst({
      where: { key: objetoKey, aplicacionId, estado: "A" },
      select: { esPublico: true },
    });
    if (objeto?.esPublico === "S") return allowWith("PUBLIC_OBJECT");

    // ── 5. Buscar funcionalidades que cubran este objeto+acción ───────
    const now = new Date();
    const funcionalidades = await prisma.funcionalidad.findMany({
      where: {
        aplicacionId,
        objetoKey,
        accionKey,
        estado: "A",
        OR:  [{ fechaDesde: null }, { fechaDesde: { lte: now } }],
        AND: [{ OR: [{ fechaHasta: null }, { fechaHasta: { gte: now } }] }],
      },
      select: { id: true, esPublico: true, soloRoot: true },
    });

    // Funcionalidad pública
    if (funcionalidades.some((f) => f.esPublico === "S")) return allowWith("PUBLIC_FUNCIONALIDAD");

    if (funcionalidades.length === 0) return denyWith("NO_FUNCIONALIDAD_DEFINED");

    // Solo root
    if (funcionalidades.every((f) => f.soloRoot === "S")) return denyWith("SOLO_ROOT");

    const funcIds = funcionalidades.filter((f) => f.soloRoot !== "S").map((f) => f.id);

    // ── 6. Acceso directo (usuario → funcionalidad) ───────────────────
    const accesoDirecto = await prisma.acceso.findFirst({
      where: {
        usuarioId:       usuario.id,
        funcionalidadId: { in: funcIds },
        efecto:          "ALLOW",
        OR:  [{ fechaDesde: null }, { fechaDesde: { lte: now } }],
        AND: [{ OR: [{ fechaHasta: null }, { fechaHasta: { gte: now } }] }],
      },
      select: { funcionalidadId: true },
    });
    if (accesoDirecto) return allowWith("DIRECT_ACCESO");

    // ── 7. Acceso vía rol (usuario → rol → funcionalidad) ─────────────
    const rolesActivos = await prisma.usuarioRol.findMany({
      where: {
        usuarioId: usuario.id,
        OR:  [{ fechaDesde: null }, { fechaDesde: { lte: now } }],
        AND: [{ OR: [{ fechaHasta: null }, { fechaHasta: { gte: now } }] }],
        rol: { estado: "A" },
      },
      select: { rolId: true },
    });

    if (rolesActivos.length > 0) {
      const rolIds = rolesActivos.map((r) => r.rolId);
      const rolFuncionalidad = await prisma.rolFuncionalidad.findFirst({
        where: {
          rolId:           { in: rolIds },
          funcionalidadId: { in: funcIds },
        },
        select: { funcionalidadId: true },
      });
      if (rolFuncionalidad) return allowWith("ROL_FUNCIONALIDAD");
    }

    // ── 8. Sin acceso ─────────────────────────────────────────────────
    return denyWith("ACCESS_DENIED");

  } catch (error) {
    console.error("[API/db/permisos POST]", error);
    return denyWith("SERVER_ERROR", 500);
  }
}


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
