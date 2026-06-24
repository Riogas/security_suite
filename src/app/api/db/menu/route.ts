import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { EFECTOS_ALLOW } from "@/lib/permisos";

const JWT_SECRET = process.env.JWT_SECRET || "security-suite-secret-key";

// Mapeo de nombre de funcionalidad → ruta + ícono (fallback plano, apps sin árbol MENU)
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

interface MenuNode {
  key: string;
  label: string;
  path: string;
  icon: string;
  type: string;
  order: number;
  children: MenuNode[];
}

// GET /api/db/menu?aplicacionId=
//
// Construye el menú de navegación.
//  - Si la app tiene objetos tipo MENU, arma el ÁRBOL jerárquico:
//    cada ObjetoAccion de un MENU/SUBMENU es un punto de menú; si su `key`
//    referencia a otro objeto SUBMENU/MENU, se recurre como submenú.
//    Gateo: con usuario identificado, solo se incluyen los puntos accesibles
//    (funcionalidad activa que matchea objetoKey+accionKey/codigo); submenús
//    visibles si tienen hijos visibles. Sin usuario → árbol completo activo.
//  - Si la app NO tiene objetos MENU, cae al modelo plano por funcionalidad.
export async function GET(request: NextRequest) {
  try {
    const qpAplicacionId = new URL(request.url).searchParams.get("aplicacionId");
    const aplicacionId = Number(
      qpAplicacionId ||
        process.env.NEXT_PUBLIC_APLICACION_ID ||
        process.env.APLICACION_ID ||
        0,
    );

    // Usuario del JWT (para gateo)
    let userId: number | null = null;
    const authHeader = request.headers.get("authorization") || "";
    const cookieToken = request.cookies.get("token")?.value;
    const rawToken = authHeader.replace("Bearer ", "") || cookieToken || "";
    if (rawToken) {
      try {
        const decoded = jwt.verify(rawToken, JWT_SECRET) as any;
        userId = decoded.userId ?? null;
      } catch {
        // token inválido/expirado → sin gateo
      }
    }

    // Funcionalidades accesibles por el usuario (roles + accesos directos).
    // null = no se identificó usuario → no se filtra (árbol/lista completa).
    let funcionalidadesIds: number[] | null = null;
    if (userId) {
      const now = new Date();
      const rolesUsuario = await prisma.usuarioRol.findMany({
        where: {
          usuarioId: userId,
          OR: [{ fechaHasta: null }, { fechaHasta: { gte: now } }],
        },
        select: { rolId: true },
      });
      let ids: number[] = [];
      if (rolesUsuario.length > 0) {
        const rolIds = rolesUsuario.map((r) => r.rolId);
        const rolFunc = await prisma.rolFuncionalidad.findMany({
          where: { rolId: { in: rolIds } },
          select: { funcionalidadId: true },
        });
        ids = rolFunc.map((rf) => rf.funcionalidadId);
      }
      const accesosDirectos = await prisma.acceso.findMany({
        where: { usuarioId: userId, efecto: { in: EFECTOS_ALLOW } },
        select: { funcionalidadId: true },
      });
      funcionalidadesIds = [...new Set([...ids, ...accesosDirectos.map((a) => a.funcionalidadId)])];
    }

    const gating = funcionalidadesIds !== null;

    // Funcionalidades activas de la app (filtradas a accesibles si hay gateo)
    const funcWhere: any = { estado: "A" };
    if (aplicacionId) funcWhere.aplicacionId = aplicacionId;
    if (funcionalidadesIds !== null) funcWhere.id = { in: funcionalidadesIds };
    const funcionalidades = await prisma.funcionalidad.findMany({
      where: funcWhere,
      select: { id: true, nombre: true, objetoKey: true, accionKey: true },
      orderBy: { nombre: "asc" },
    });

    // ¿La app tiene objetos tipo MENU? → modo árbol
    const menuObjetos = await prisma.objeto.findMany({
      where: { aplicacionId: aplicacionId || undefined, estado: "A", tipo: "MENU" },
      select: { id: true },
    });

    if (menuObjetos.length > 0) {
      const menu = await construirArbol(aplicacionId, funcionalidades, gating);
      return NextResponse.json({ success: true, menu });
    }

    // ── Fallback plano (apps sin estructura MENU, ej. SecuritySuite) ──────────
    const menu = await construirPlano(aplicacionId, funcionalidades);
    return NextResponse.json({ success: true, menu });
  } catch (error) {
    console.error("[API/db/menu GET]", error);
    return NextResponse.json({ success: false, error: "Error al generar menú" }, { status: 500 });
  }
}

// ── Árbol jerárquico desde objetos MENU/SUBMENU y sus ObjetoAcciones ─────────
async function construirArbol(
  aplicacionId: number,
  funcionalidades: { objetoKey: string | null; accionKey: string | null }[],
  gating: boolean,
): Promise<MenuNode[]> {
  const objetos = await prisma.objeto.findMany({
    where: { aplicacionId: aplicacionId || undefined, estado: "A" },
    select: {
      id: true,
      key: true,
      label: true,
      path: true,
      icon: true,
      tipo: true,
      orden: true,
      acciones: {
        select: { id: true, key: true, label: true, path: true, icon: true, codigo: true, relacion: true },
        orderBy: { id: "asc" },
      },
    },
  });

  const objetosByKey = new Map(objetos.map((o) => [o.key.toLowerCase(), o]));
  const objetosById = new Map(objetos.map((o) => [o.id, o]));

  // Set de puntos accesibles: "objetoKey|accionKey" (accionKey puede ser codigo o key)
  const accesibles = new Set<string>();
  for (const f of funcionalidades) {
    if (f.objetoKey && f.accionKey) {
      accesibles.add(`${f.objetoKey.toLowerCase()}|${f.accionKey}`);
    }
  }
  const esAccesible = (parentKey: string, accion: { key: string; codigo: string | null }) => {
    if (!gating) return true;
    const pk = parentKey.toLowerCase();
    return (
      (accion.codigo != null && accesibles.has(`${pk}|${accion.codigo}`)) ||
      accesibles.has(`${pk}|${accion.key}`)
    );
  };

  type Obj = (typeof objetos)[number];

  const buildChildren = (objeto: Obj, visited: Set<number>): MenuNode[] => {
    if (visited.has(objeto.id)) return [];
    visited.add(objeto.id);

    const nodes: MenuNode[] = [];
    let i = 0;
    for (const accion of objeto.acciones) {
      // El enlace acción → sub-objeto es por `relacion` (id); fallback por key.
      const childObj =
        (accion.relacion != null ? objetosById.get(accion.relacion) : undefined) ??
        objetosByKey.get(accion.key.toLowerCase());
      const isContainer =
        childObj && (childObj.tipo === "SUBMENU" || childObj.tipo === "MENU");

      if (isContainer) {
        const children = buildChildren(childObj!, visited);
        if (children.length > 0 || !gating) {
          nodes.push({
            key: accion.key,
            label: accion.label ?? childObj!.label ?? accion.key,
            path: accion.path ?? childObj!.path ?? "#",
            icon: accion.icon ?? childObj!.icon ?? "menu",
            type: "SUBMENU",
            order: i,
            children,
          });
        }
      } else if (esAccesible(objeto.key, accion)) {
        nodes.push({
          key: accion.key,
          label: accion.label ?? accion.key,
          path: accion.path ?? childObj?.path ?? "#",
          icon: accion.icon ?? childObj?.icon ?? "menu",
          type: "PAGE",
          order: i,
          children: [],
        });
      }
      i++;
    }
    return nodes;
  };

  // Raíces: objetos tipo MENU. Sus acciones son los puntos de primer nivel.
  const visited = new Set<number>();
  const roots = objetos.filter((o) => o.tipo === "MENU").sort((a, b) => a.orden - b.orden);
  const top: MenuNode[] = [];
  for (const m of roots) {
    top.push(...buildChildren(m, visited));
  }
  return top;
}

// ── Modelo plano: una entrada por funcionalidad (Objeto > route map > nombre) ─
async function construirPlano(
  aplicacionId: number,
  funcionalidades: { id: number; nombre: string; objetoKey: string | null }[],
): Promise<MenuNode[]> {
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
  const funcIds = funcionalidades.map((f) => f.id);

  if (funcIds.length > 0) {
    const links = await prisma.funcionalidadObjetoAccion.findMany({
      where: { funcionalidadId: { in: funcIds }, objeto: { estado: "A" } },
      select: {
        funcionalidadId: true,
        objeto: { select: { key: true, label: true, path: true, icon: true, tipo: true, orden: true } },
      },
    });
    for (const l of links) {
      if (!l.objeto) continue;
      const prev = objetoPorFunc.get(l.funcionalidadId);
      if (!prev || score(l.objeto) > score(prev)) objetoPorFunc.set(l.funcionalidadId, l.objeto);
    }
    const faltantes = funcionalidades.filter((f) => !objetoPorFunc.has(f.id) && f.objetoKey);
    if (faltantes.length > 0) {
      const keys = [...new Set(faltantes.map((f) => f.objetoKey as string))];
      const objs = await prisma.objeto.findMany({
        where: { key: { in: keys }, estado: "A", ...(aplicacionId ? { aplicacionId } : {}) },
        select: { key: true, label: true, path: true, icon: true, tipo: true, orden: true },
      });
      const byKey = new Map(objs.map((o) => [o.key, o]));
      for (const f of faltantes) {
        const o = byKey.get(f.objetoKey as string);
        if (o) objetoPorFunc.set(f.id, o);
      }
    }
  }

  const menuItems: MenuNode[] = funcionalidades
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

  const dashboardItem: MenuNode = {
    key: "dashboard",
    label: "Dashboard",
    path: "/dashboard",
    icon: "home",
    type: "PAGE",
    order: 0,
    children: [],
  };
  return menuItems.some((i) => i.path === "/dashboard")
    ? menuItems
    : [dashboardItem, ...menuItems];
}
