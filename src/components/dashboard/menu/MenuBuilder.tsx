"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { iconMap } from "@/components/dashboard/iconMap";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";
import {
  GripVertical,
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Save,
  RotateCcw,
  FolderTree,
  FolderPlus,
  FilePlus2,
  Menu as MenuIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  apiAplicacionesDB,
  apiMenuBuilderGet,
  apiMenuBuilderSave,
  type AplicacionDB,
  type MenuBuilderNode,
  type MenuBuilderRecurso,
  type MenuNodeKind,
} from "@/services/api";
import MenuNodeModal, { type NodeDraft } from "./MenuNodeModal";

// ─── Tipos locales (con uid de cliente) ──────────────────────────────
interface TNode {
  uid: string;
  nodeKind: MenuNodeKind;
  objetoId?: number;
  objetoAccionId?: number;
  key: string;
  label: string;
  path: string;
  icon: string;
  estado: "A" | "I";
  targetObjetoId?: number | null;
  children: TNode[];
}

const KIND_CHIP: Record<MenuNodeKind, { label: string; cls: string }> = {
  GROUP: { label: "Grupo", cls: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" },
  SUBMENU: { label: "Submenú", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-300" },
  LINK: { label: "Página", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
};

function genUid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

const toTree = (nodes: MenuBuilderNode[]): TNode[] =>
  nodes.map((n) => ({
    uid: genUid(),
    nodeKind: n.nodeKind,
    objetoId: n.objetoId,
    objetoAccionId: n.objetoAccionId,
    key: n.key,
    label: n.label,
    path: n.path,
    icon: n.icon,
    estado: n.estado,
    targetObjetoId: n.targetObjetoId ?? null,
    children: toTree(n.children ?? []),
  }));

const fromTree = (nodes: TNode[]): MenuBuilderNode[] =>
  nodes.map((n) => ({
    nodeKind: n.nodeKind,
    objetoId: n.objetoId,
    objetoAccionId: n.objetoAccionId,
    key: n.key,
    label: n.label,
    path: n.path,
    icon: n.icon,
    estado: n.estado,
    targetObjetoId: n.targetObjetoId ?? null,
    children: fromTree(n.children),
  }));

// ── helpers inmutables sobre el árbol ────────────────────────────────
function mapTree(nodes: TNode[], fn: (n: TNode) => TNode): TNode[] {
  return nodes.map((n) => fn({ ...n, children: mapTree(n.children, fn) }));
}
function updateNode(nodes: TNode[], uid: string, patch: Partial<TNode>): TNode[] {
  return mapTree(nodes, (n) => (n.uid === uid ? { ...n, ...patch } : n));
}
function removeNode(nodes: TNode[], uid: string): TNode[] {
  return nodes
    .filter((n) => n.uid !== uid)
    .map((n) => ({ ...n, children: removeNode(n.children, uid) }));
}
function addChildTo(nodes: TNode[], parentUid: string | null, child: TNode): TNode[] {
  if (parentUid === null) return [...nodes, child];
  return nodes.map((n) =>
    n.uid === parentUid
      ? { ...n, children: [...n.children, child] }
      : { ...n, children: addChildTo(n.children, parentUid, child) },
  );
}
function findSiblings(
  nodes: TNode[],
  uid: string,
  parentUid: string | null = null,
): { parentUid: string | null; ids: string[] } | null {
  if (nodes.some((n) => n.uid === uid)) return { parentUid, ids: nodes.map((n) => n.uid) };
  for (const n of nodes) {
    const r = findSiblings(n.children, uid, n.uid);
    if (r) return r;
  }
  return null;
}
function reorderChildren(
  nodes: TNode[],
  parentUid: string | null,
  fromUid: string,
  toUid: string,
): TNode[] {
  const reorder = (list: TNode[]): TNode[] => {
    const from = list.findIndex((n) => n.uid === fromUid);
    const to = list.findIndex((n) => n.uid === toUid);
    if (from < 0 || to < 0) return list;
    return arrayMove(list, from, to);
  };
  if (parentUid === null) return reorder(nodes);
  return nodes.map((n) =>
    n.uid === parentUid
      ? { ...n, children: reorder(n.children) }
      : { ...n, children: reorderChildren(n.children, parentUid, fromUid, toUid) },
  );
}

// ─── Componente ──────────────────────────────────────────────────────
export default function MenuBuilder() {
  const [aplicaciones, setAplicaciones] = useState<AplicacionDB[]>([]);
  const [aplicacionId, setAplicacionId] = useState<string>("");
  const [tree, setTree] = useState<TNode[]>([]);
  const [recursos, setRecursos] = useState<MenuBuilderRecurso[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // modal de edición
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [draft, setDraft] = useState<NodeDraft | null>(null);
  const [pendingParent, setPendingParent] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    (async () => {
      try {
        const res = await apiAplicacionesDB({ estado: "A", pageSize: 1000 });
        const items = res?.items ?? [];
        setAplicaciones(items);
        if (items.length > 0) setAplicacionId(String(items[0].id));
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const loadTree = useCallback(async (appId: string) => {
    if (!appId) return;
    try {
      setLoading(true);
      const res = await apiMenuBuilderGet(Number(appId));
      setTree(toTree(res?.tree ?? []));
      setRecursos(res?.recursos ?? []);
      setDirty(false);
    } catch (e) {
      console.error(e);
      toast.error("Error al cargar el árbol del menú");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (aplicacionId) loadTree(aplicacionId);
  }, [aplicacionId, loadTree]);

  const markDirty = () => setDirty(true);

  const toggleCollapse = (uid: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });

  // abrir modal para crear
  const openCreate = (kind: MenuNodeKind, parentUid: string | null) => {
    setEditingUid(null);
    setPendingParent(parentUid);
    setDraft({ nodeKind: kind, key: "", label: "", path: "", icon: "", estado: "A", targetObjetoId: null });
    setModalOpen(true);
  };
  // abrir modal para editar
  const openEdit = (n: TNode) => {
    setEditingUid(n.uid);
    setPendingParent(null);
    setDraft({
      nodeKind: n.nodeKind,
      key: n.key,
      label: n.label,
      path: n.path,
      icon: n.icon,
      estado: n.estado,
      targetObjetoId: n.targetObjetoId ?? null,
    });
    setModalOpen(true);
  };

  const onModalSave = (d: NodeDraft) => {
    if (editingUid) {
      setTree((t) => updateNode(t, editingUid, { ...d }));
    } else {
      const node: TNode = { uid: genUid(), ...d, children: [] };
      setTree((t) => addChildTo(t, pendingParent, node));
      if (pendingParent) setCollapsed((prev) => { const n = new Set(prev); n.delete(pendingParent); return n; });
    }
    markDirty();
    setModalOpen(false);
  };

  const deleteNode = (uid: string) => {
    if (!confirm("¿Eliminar este punto del menú y sus hijos?")) return;
    setTree((t) => removeNode(t, uid));
    markDirty();
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const a = findSiblings(tree, String(active.id));
    const b = findSiblings(tree, String(over.id));
    if (!a || !b || a.parentUid !== b.parentUid) return; // solo reordenar entre hermanos
    setTree((t) => reorderChildren(t, a.parentUid, String(active.id), String(over.id)));
    markDirty();
  };

  const save = async () => {
    try {
      setSaving(true);
      await apiMenuBuilderSave(Number(aplicacionId), fromTree(tree));
      toast.success("Menú guardado correctamente");
      await loadTree(aplicacionId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar el menú");
    } finally {
      setSaving(false);
    }
  };

  const appNombre = useMemo(
    () => aplicaciones.find((a) => String(a.id) === aplicacionId)?.nombre,
    [aplicaciones, aplicacionId],
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-gradient-to-r from-primary/5 to-transparent p-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <FolderTree className="size-5" />
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Aplicación</div>
            <Select value={aplicacionId} onValueChange={setAplicacionId}>
              <SelectTrigger className="w-56 h-8">
                <SelectValue placeholder="Elegí una aplicación" />
              </SelectTrigger>
              <SelectContent>
                {aplicaciones.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => openCreate("GROUP", null)}>
            <Plus className="w-4 h-4 mr-1" /> Grupo
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadTree(aplicacionId)} disabled={loading}>
            <RotateCcw className="w-4 h-4 mr-1" /> Recargar
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? "Guardando…" : "Guardar"}
            {dirty && !saving && <span className="ml-2 size-2 rounded-full bg-amber-400" />}
          </Button>
        </div>
      </div>

      {/* Árbol */}
      <div className="rounded-xl border p-3 min-h-[300px]">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="size-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <FolderTree className="size-7 text-muted-foreground" />
            </div>
            <p className="font-medium">Sin menú para {appNombre ?? "esta aplicación"}</p>
            <p className="text-sm text-muted-foreground mb-4">
              Empezá creando un grupo de nivel superior.
            </p>
            <Button onClick={() => openCreate("GROUP", null)}>
              <Plus className="w-4 h-4 mr-1" /> Crear grupo
            </Button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <NodeList
              nodes={tree}
              parentUid={null}
              depth={0}
              collapsed={collapsed}
              onToggle={toggleCollapse}
              onAddChild={(parentUid, kind) => openCreate(kind, parentUid)}
              onEdit={openEdit}
              onDelete={deleteNode}
            />
          </DndContext>
        )}
      </div>

      <MenuNodeModal
        open={modalOpen}
        initial={draft}
        recursos={recursos}
        onClose={() => setModalOpen(false)}
        onSave={onModalSave}
      />
    </div>
  );
}

// ─── Lista de hermanos (sortable) ────────────────────────────────────
function NodeList({
  nodes,
  parentUid,
  depth,
  collapsed,
  onToggle,
  onAddChild,
  onEdit,
  onDelete,
}: {
  nodes: TNode[];
  parentUid: string | null;
  depth: number;
  collapsed: Set<string>;
  onToggle: (uid: string) => void;
  onAddChild: (parentUid: string, kind: MenuNodeKind) => void;
  onEdit: (n: TNode) => void;
  onDelete: (uid: string) => void;
}) {
  return (
    <SortableContext items={nodes.map((n) => n.uid)} strategy={verticalListSortingStrategy}>
      <div className="space-y-1">
        {nodes.map((n) => (
          <NodeRow
            key={n.uid}
            node={n}
            depth={depth}
            collapsed={collapsed}
            onToggle={onToggle}
            onAddChild={onAddChild}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </SortableContext>
  );
}

// ─── Fila de nodo ────────────────────────────────────────────────────
function NodeRow({
  node,
  depth,
  collapsed,
  onToggle,
  onAddChild,
  onEdit,
  onDelete,
}: {
  node: TNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (uid: string) => void;
  onAddChild: (parentUid: string, kind: MenuNodeKind) => void;
  onEdit: (n: TNode) => void;
  onDelete: (uid: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.uid,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isContainer = node.nodeKind === "GROUP" || node.nodeKind === "SUBMENU";
  const isOpen = !collapsed.has(node.uid);
  const chip = KIND_CHIP[node.nodeKind];
  const Icon = (node.icon && iconMap[node.icon as keyof typeof iconMap]) || MenuIcon;

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className="group flex items-center gap-2 rounded-lg border bg-card px-2 py-2 hover:bg-muted/40 transition-colors"
        style={{ marginLeft: depth * 20 }}
      >
        <button
          className="cursor-grab active:cursor-grabbing text-muted-foreground"
          {...attributes}
          {...listeners}
          aria-label="Arrastrar"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        {isContainer ? (
          <button onClick={() => onToggle(node.uid)} aria-label="Expandir/colapsar">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-4" />
        )}

        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />

        <span className="font-medium text-sm truncate">{node.label}</span>
        <Badge className={`text-[10px] ${chip.cls}`} variant="secondary">
          {chip.label}
        </Badge>
        {node.path && (
          <code className="text-xs text-muted-foreground truncate hidden md:inline">{node.path}</code>
        )}

        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {isContainer && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Agregar submenú"
                onClick={() => onAddChild(node.uid, "SUBMENU")}
              >
                <FolderPlus className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Agregar página"
                onClick={() => onAddChild(node.uid, "LINK")}
              >
                <FilePlus2 className="w-4 h-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => onEdit(node)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            title="Eliminar"
            onClick={() => onDelete(node.uid)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isContainer && isOpen && node.children.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="mt-1 overflow-hidden"
          >
            <NodeList
              nodes={node.children}
              parentUid={node.uid}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
