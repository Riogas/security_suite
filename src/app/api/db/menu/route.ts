import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "security-suite-secret-key";

// Mapeo de nombre de funcionalidad → ruta + ícono del sidebar
const FUNCIONALIDAD_ROUTE_MAP: Record<string, { path: string; icon: string; order: number }> = {
  usuarios:       { path: "/dashboard/usuarios",       icon: "users",       order: 1 },
  roles:          { path: "/dashboard/roles",           icon: "shield",      order: 2 },
  aplicaciones:   { path: "/dashboard/aplicaciones",   icon: "grid",        order: 3 },
  funcionalidades:{ path: "/dashboard/funcionalidades", icon: "settings",    order: 4 },
  accesos:        { path: "/dashboard/accesos",         icon: "lock",        order: 5 },
  objetos:        { path: "/dashboard/objetos",         icon: "layers",      order: 6 },
  dashboard:      { path: "/dashboard",                 icon: "home",        order: 0 },
};

function normalizeKey(nombre: string): string {
  return nombre.toLowerCase().trim().replace(/\s+/g, "");
}

// GET /api/db/menu
// Genera el menú de navegación a partir de las funcionalidades en la DB.
// Si se provee un JWT válido en el header Authorization, filtra por los roles del usuario.
// Si no hay auth, devuelve todas las funcionalidades activas (modo fallback para sidebar).
export async function GET(request: NextRequest) {
  try {
    const aplicacionId = Number(
      process.env.NEXT_PUBLIC_APLICACION_ID || process.env.APLICACION_ID || 0,
    );

    // Intentar extraer usuario del JWT para filtrar por roles
    let userId: number | null = null;
    const authHeader = request.headers.get("authorization") || "";
    const cookieToken = request.cookies.get("token")?.value;
    const rawToken = authHeader.replace("Bearer ", "") || cookieToken || "";

    if (rawToken) {
      try {
        const decoded = jwt.verify(rawToken, JWT_SECRET) as any;
        userId = decoded.userId ?? null;
      } catch {
        // Token inválido o expirado — continuamos sin filtrar
      }
    }

    // Si tenemos userId, filtrar funcionalidades accesibles por roles del usuario
    let funcionalidadesIds: number[] | null = null;
    if (userId) {
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
        const rolFuncionalidades = await prisma.rolFuncionalidad.findMany({
          where: { rolId: { in: rolIds } },
          select: { funcionalidadId: true },
        });
        funcionalidadesIds = [...new Set(rolFuncionalidades.map((rf) => rf.funcionalidadId))];
      }

      // También incluir accesos directos del usuario (efecto ALLOW)
      const accesosDirectos = await prisma.acceso.findMany({
        where: { usuarioId: userId, efecto: "ALLOW" },
        select: { funcionalidadId: true },
      });
      const directIds = accesosDirectos.map((a) => a.funcionalidadId);

      if (funcionalidadesIds) {
        funcionalidadesIds = [...new Set([...funcionalidadesIds, ...directIds])];
      } else {
        funcionalidadesIds = directIds;
      }
    }

    // Consultar funcionalidades activas
    const where: any = { estado: "A" };
    if (aplicacionId) where.aplicacionId = aplicacionId;
    if (funcionalidadesIds !== null) where.id = { in: funcionalidadesIds };

    const funcionalidades = await prisma.funcionalidad.findMany({
      where,
      orderBy: { nombre: "asc" },
    });

    // Construir árbol de menú
    const menuItems = funcionalidades
      .map((func) => {
        const key = normalizeKey(func.nombre);
        const route = FUNCIONALIDAD_ROUTE_MAP[key];
        return {
          key: func.nombre.toLowerCase().replace(/\s+/g, "-"),
          label: func.nombre,
          path: route?.path ?? `/dashboard/${key}`,
          icon: route?.icon ?? "menu",
          type: "PAGE",
          order: route?.order ?? 99,
          children: [],
        };
      })
      .sort((a, b) => a.order - b.order);

    // Agregar Dashboard como primer ítem siempre
    const dashboardItem = {
      key: "dashboard",
      label: "Dashboard",
      path: "/dashboard",
      icon: "home",
      type: "PAGE",
      order: 0,
      children: [],
    };

    const allItems = menuItems.some((i) => i.path === "/dashboard")
      ? menuItems
      : [dashboardItem, ...menuItems];

    return NextResponse.json({ success: true, menu: allItems });
  } catch (error) {
    console.error("[API/db/menu GET]", error);
    return NextResponse.json({ success: false, error: "Error al generar menú" }, { status: 500 });
  }
}
