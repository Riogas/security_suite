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

/** Decodifica JWT sin verificar firma â€” igual que el middleware Edge */
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

    // â”€â”€ 1. JWT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const token = extractToken(request);
    if (!token) return denyWith("NO_TOKEN", 401);

    const payload = decodeJwt(token);
    if (!payload) return denyWith("INVALID_TOKEN", 401);

    const rawUsername =
      payload.username ?? payload.sub ?? payload.name ??
      payload.email ?? payload.preferred_username ?? null;

    if (!rawUsername) return denyWith("NO_USERNAME_IN_TOKEN");

    const usernameStr = String(rawUsername).trim();

    // â”€â”€ 2. Usuario â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 3. Root siempre permite â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (usuario.esRoot === "S") return allowWith("ROOT");

    // â”€â”€ 4. Objeto pÃºblico â†’ permite sin mÃ¡s checks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const objeto = await prisma.objeto.findFirst({
      where: { key: objetoKey, aplicacionId, estado: "A" },
      select: { esPublico: true },
    });
    if (objeto?.esPublico === "S") return allowWith("PUBLIC_OBJECT");

    // â”€â”€ 5. Buscar funcionalidades que cubran este objeto+acciÃ³n â”€â”€â”€â”€â”€â”€â”€
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

    // Funcionalidad pÃºblica
    if (funcionalidades.some((f) => f.esPublico === "S")) return allowWith("PUBLIC_FUNCIONALIDAD");

    if (funcionalidades.length === 0) return denyWith("NO_FUNCIONALIDAD_DEFINED");

    // Solo root
    if (funcionalidades.every((f) => f.soloRoot === "S")) return denyWith("SOLO_ROOT");

    const funcIds = funcionalidades.filter((f) => f.soloRoot !== "S").map((f) => f.id);

    // â”€â”€ 6. Acceso directo (usuario â†’ funcionalidad) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 7. Acceso vÃ­a rol (usuario â†’ rol â†’ funcionalidad) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 8. Sin acceso â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    return denyWith("ACCESS_DENIED");

  } catch (error) {
    console.error("[API/db/permisos POST]", error);
    return denyWith("SERVER_ERROR", 500);
  }
}
