import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generarAccionCodigo } from "@/lib/objetoAccionCode";

// =====================================================================
// /api/db/menu/builder
//
// GET  ?aplicacionId=  -> árbol editable (GROUP/SUBMENU/LINK) + catálogo de
//                         recursos PAGE/FEATURE para referenciar.
// PUT  { aplicacionId, tree } -> reconcilia la estructura en una transacción.
//
// Mapeo: GROUP = Objeto MENU; SUBMENU = Objeto SUBMENU + acción del padre;
//        LINK  = acción del padre con relacion -> objeto PAGE/FEATURE.
// =====================================================================

type NodeKind = "GROUP" | "SUBMENU" | "LINK";

interface BuilderNode {
  nodeKind: NodeKind;
  objetoId?: number;       // contenedor (GROUP/SUBMENU)
  objetoAccionId?: number; // punto de menú (SUBMENU/LINK)
  key: string;
  label: string;
  path: string;
  icon: string;
  estado: "A" | "I";
  targetObjetoId?: number | null; // LINK -> PAGE/FEATURE
  children?: BuilderNode[];
}

function resolveAplicacionIdParam(req: NextRequest): number {
  const qp = new URL(req.url).searchParams.get("aplicacionId");
  return Number(qp || process.env.NEXT_PUBLIC_APLICACION_ID || process.env.APLICACION_ID || 0);
}

// ─── GET: árbol editable ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const aplicacionId = resolveAplicacionIdParam(request);
    if (!aplicacionId) {
      return NextResponse.json({ success: false, error: "aplicacionId requerido" }, { status: 400 });
    }

    const objetos = await prisma.objeto.findMany({
      where: { aplicacionId, estado: "A" },
      select: {
        id: true, key: true, label: true, path: true, icon: true, tipo: true, orden: true, estado: true,
        acciones: {
          select: { id: true, key: true, label: true, path: true, icon: true, relacion: true, orden: true },
          orderBy: [{ orden: "asc" }, { id: "asc" }],
        },
      },
      orderBy: { orden: "asc" },
    });

    const byId = new Map(objetos.map((o) => [o.id, o]));
    type Obj = (typeof objetos)[number];

    const buildContainer = (cont: Obj, visited: Set<number>): BuilderNode[] => {
      if (visited.has(cont.id)) return [];
      visited.add(cont.id);
      const nodes: BuilderNode[] = [];
      for (const a of cont.acciones) {
        const target = a.relacion != null ? byId.get(a.relacion) : undefined;
        if (target && (target.tipo === "SUBMENU" || target.tipo === "MENU")) {
          nodes.push({
            nodeKind: "SUBMENU",
            objetoId: target.id,
            objetoAccionId: a.id,
            key: a.key,
            label: a.label ?? target.label ?? a.key,
            path: a.path ?? "",
            icon: a.icon ?? "",
            estado: "A",
            children: buildContainer(target, visited),
          });
        } else {
          nodes.push({
            nodeKind: "LINK",
            objetoAccionId: a.id,
            key: a.key,
            label: a.label ?? a.key,
            path: a.path ?? "",
            icon: a.icon ?? "",
            estado: "A",
            targetObjetoId: a.relacion ?? null,
            children: [],
          });
        }
      }
      return nodes;
    };

    const visited = new Set<number>();
    const roots: BuilderNode[] = objetos
      .filter((o) => o.tipo === "MENU")
      .map((m) => ({
        nodeKind: "GROUP" as const,
        objetoId: m.id,
        key: m.key,
        label: m.label ?? m.key,
        path: m.path ?? "",
        icon: m.icon ?? "",
        estado: "A" as const,
        children: buildContainer(m, visited),
      }));

    const recursos = objetos
      .filter((o) => o.tipo === "PAGE" || o.tipo === "FEATURE")
      .map((o) => ({ id: o.id, key: o.key, label: o.label, path: o.path, tipo: o.tipo }));

    return NextResponse.json({ success: true, tree: roots, recursos });
  } catch (error) {
    console.error("[API/db/menu/builder GET]", error);
    return NextResponse.json({ success: false, error: "Error al cargar el árbol" }, { status: 500 });
  }
}

// ─── PUT: reconciliar ────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const aplicacionId = Number(body.aplicacionId);
    const tree: BuilderNode[] = Array.isArray(body.tree) ? body.tree : [];
    if (!aplicacionId) {
      return NextResponse.json({ success: false, error: "aplicacionId requerido" }, { status: 400 });
    }

    // Estado previo: contenedores (MENU/SUBMENU) activos y sus acciones
    const contenedoresPrevios = await prisma.objeto.findMany({
      where: { aplicacionId, estado: "A", tipo: { in: ["MENU", "SUBMENU"] } },
      select: { id: true, acciones: { select: { id: true } } },
    });
    const accionesPreviasIds = new Set<number>();
    const contenedoresPreviosIds = new Set<number>();
    for (const c of contenedoresPrevios) {
      contenedoresPreviosIds.add(c.id);
      for (const a of c.acciones) accionesPreviasIds.add(a.id);
    }

    const keptObjetos = new Set<number>();
    const keptAcciones = new Set<number>();

    await prisma.$transaction(async (tx) => {
      // upsert de un objeto contenedor (MENU/SUBMENU)
      const upsertContenedor = async (
        node: BuilderNode,
        tipo: "MENU" | "SUBMENU",
        parentId: number | null,
        orden: number,
      ): Promise<number> => {
        const data = {
          aplicacionId,
          tipo,
          key: node.key,
          label: node.label || null,
          path: node.path || null,
          icon: node.icon || null,
          orden,
          estado: "A",
          parentId,
        };
        let id: number;
        if (node.objetoId) {
          await tx.objeto.update({ where: { id: node.objetoId }, data });
          id = node.objetoId;
        } else {
          const creado = await tx.objeto.create({ data, select: { id: true } });
          id = creado.id;
        }
        keptObjetos.add(id);
        return id;
      };

      // upsert de una acción (punto de menú) en un contenedor
      const upsertAccion = async (
        contenedorId: number,
        contenedorKey: string,
        node: BuilderNode,
        relacion: number | null,
        orden: number,
      ) => {
        const codigo = await generarAccionCodigo(contenedorKey, node.key);
        const data = {
          objetoId: contenedorId,
          key: node.key,
          label: node.label || null,
          path: node.path || null,
          icon: node.icon || null,
          relacion,
          orden,
          codigo,
        };
        let id: number;
        if (node.objetoAccionId && accionesPreviasIds.has(node.objetoAccionId)) {
          await tx.objetoAccion.update({ where: { id: node.objetoAccionId }, data });
          id = node.objetoAccionId;
        } else {
          const creada = await tx.objetoAccion.create({ data, select: { id: true } });
          id = creada.id;
        }
        keptAcciones.add(id);
      };

      // procesa los hijos de un contenedor
      const procesarHijos = async (
        contenedorId: number,
        contenedorKey: string,
        hijos: BuilderNode[],
      ) => {
        for (let i = 0; i < hijos.length; i++) {
          const child = hijos[i];
          if (child.nodeKind === "SUBMENU") {
            const subId = await upsertContenedor(child, "SUBMENU", contenedorId, i);
            await upsertAccion(contenedorId, contenedorKey, child, subId, i);
            await procesarHijos(subId, child.key, child.children ?? []);
          } else {
            // LINK
            await upsertAccion(contenedorId, contenedorKey, child, child.targetObjetoId ?? null, i);
          }
        }
      };

      // raíces = GROUP (MENU)
      for (let i = 0; i < tree.length; i++) {
        const group = tree[i];
        const grupoId = await upsertContenedor(group, "MENU", null, i);
        await procesarHijos(grupoId, group.key, group.children ?? []);
      }

      // Borrado: acciones removidas (hard) y contenedores huérfanos (soft estado I)
      const accionesABorrar = [...accionesPreviasIds].filter((id) => !keptAcciones.has(id));
      if (accionesABorrar.length > 0) {
        await tx.objetoAccion.deleteMany({ where: { id: { in: accionesABorrar } } });
      }
      const contenedoresAInactivar = [...contenedoresPreviosIds].filter((id) => !keptObjetos.has(id));
      if (contenedoresAInactivar.length > 0) {
        await tx.objeto.updateMany({
          where: { id: { in: contenedoresAInactivar } },
          data: { estado: "I" },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API/db/menu/builder PUT]", error);
    return NextResponse.json({ success: false, error: "Error al guardar el árbol" }, { status: 500 });
  }
}
