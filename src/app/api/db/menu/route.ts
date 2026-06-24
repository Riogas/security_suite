import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { EFECTOS_ALLOW } from "@/lib/permisos";

const JWT_SECRET = process.env.JWT_SECRET || "security-suite-secret-key";

// Mapeo de nombre de funcionalidad → ruta + ícono del sidebar
const FUNCIONALIDAD_ROUTE_MAP: Record<string, { path: string; icon: string; order: number }> = {
  usuarios:       { path: "/dashboard/usuarios",       icon: "users",       order: 1 },
  roles:          { path: "/dashboard/roles",           icon: "shield",      order: 2 },
  aplicaciones:   { path: "/dashboard/aplicaciones",   icon: "grid",        order: 3 },
  funcionalidades:{ path: "/dashboard/funcionalidades", icon: "settings",    order: 4 },
  accesos:        { path: "/dashboard/accesos",         icon: "lock",        order: 5 },
  objetos:        { path: "/dashboard/objetos",         icon: "layers",      order: 6 },
  solicitudes:    { path: "/dashboard/solicitudes",     icon: "inbox",       order: 7 },
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
    // aplicacionId: query param ?aplicacionId= tiene prioridad; si no, el del env.
    const qpAplicacionId = new URL(request.url).searchParams.get("aplicacionId");
    const aplicacionId = Number(
      qpAplicacionId ||
        process.env.NEXT_PUBLIC_APLICACION_ID ||
        process.env.APLICACION_ID ||
        0,
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
        where: { usuarioId: userId, efecto: { in: EFECTOS_ALLOW } },
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
      select: { id: true, nombre: true, objetoKey: true },
      orderBy: { nombre: "asc" },
    });

    const funcIds = funcionalidades.map((f) => f.id);

    // Resolver el Objeto representativo de cada funcionalidad (fuente de verdad
    // de path/label/icon/key). Se prioriza el vínculo FuncionalidadObjetoAccion.
    type ObjMenu = {
      key: string;
      label: string | null;
      path: string | null;
      icon: string | null;
      tipo: string;
      orden: number;
    };
    const objetoPorFunc = new Map<number, ObjMenu>();
    const score = (o: ObjMenu) =>
      (o.path ? 2 : 0) + (o.tipo === "MENU" || o.tipo === "PAGE" ? 1 : 0);

    if (funcIds.length > 0) {
      const links = await prisma.funcionalidadObjetoAccion.findMany({
        where: { funcionalidadId: { in: funcIds }, objeto: { estado: "A" } },
        select: {
          funcionalidadId: true,
          objeto: {
            select: { key: true, label: true, path: true, icon: true, tipo: true, orden: true },
          },
        },
      });
      for (const l of links) {
        if (!l.objeto) continue;
        const prev = objetoPorFunc.get(l.funcionalidadId);
        if (!prev || score(l.objeto) > score(prev)) {
          objetoPorFunc.set(l.funcionalidadId, l.objeto);
        }
      }

      // Fallback por objetoKey para funcionalidades sin vínculo en la tabla
      const faltantes = funcionalidades.filter(
        (f) => !objetoPorFunc.has(f.id) && f.objetoKey,
      );
      if (faltantes.length > 0) {
        const keys = [...new Set(faltantes.map((f) => f.objetoKey as string))];
        const objs = await prisma.objeto.findMany({
          where: {
            key: { in: keys },
            estado: "A",
            ...(aplicacionId ? { aplicacionId } : {}),
          },
          select: { key: true, label: true, path: true, icon: true, tipo: true, orden: true },
        });
        const byKey = new Map(objs.map((o) => [o.key, o]));
        for (const f of faltantes) {
          const o = byKey.get(f.objetoKey as string);
          if (o) objetoPorFunc.set(f.id, o);
        }
      }
    }

    // Construir árbol de menú. Prioridad: Objeto > FUNCIONALIDAD_ROUTE_MAP > derivado del nombre
    const menuItems = funcionalidades
      .map((func) => {
        const obj = objetoPorFunc.get(func.id);
        const nameKey = normalizeKey(func.nombre);
        const route = FUNCIONALIDAD_ROUTE_MAP[nameKey];
        return {
          key: obj?.key ?? func.nombre.toLowerCase().replace(/\s+/g, "-"),
          label: obj?.label ?? func.nombre,
          path: obj?.path ?? route?.path ?? `/dashboard/${nameKey}`,
          icon: obj?.icon ?? route?.icon ?? "menu",
          type: obj?.tipo ?? "PAGE",
          order: obj?.orden ?? route?.order ?? 99,
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
