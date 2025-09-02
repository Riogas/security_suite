"use client";

import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { GripVertical, Plus, X } from "lucide-react";
import { DndContext, DragEndEvent, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, useDroppable, DragOverlay, useDraggable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { format } from "date-fns";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { apiListarObjetos } from "@/services/api";

export type EstadoCode = "A" | "I";

export type ActionItem = {
  id: string;
  key: string;
  label: string;
  path?: string;
};

export type ObjectItem = {
  id: string;
  key: string;
  label: string;
  path?: string;
  actions: ActionItem[];
};

export type DateRange = { from?: Date; to?: Date };

export type FuncionalidadData = {
  id?: string;
  nombre: string;
  estado: EstadoCode;
  esPublico: boolean;
  soloRoot: boolean;
  rango: DateRange;
  selected: Record<string, string[]>; // objId -> actionIds
};

export type FuncionalidadFormProps = {
  mode?: "create" | "edit";
  initialData?: Partial<FuncionalidadData>;
  objects?: ObjectItem[]; // permitir inyectar desde API
  objetosQuery?: Partial<{ Estado: string; ObjetoEsPublico: "S" | "N"; ObjetoTipo: string; Pagesize: number; CurrentPage: number; sinMigrar: boolean }>; // (compat) no se usa con listarObjetos
  aplicacionId?: number | string; // para /listarObjetos (fallback a env)
  onSubmit?: (data: FuncionalidadData) => void;
  onCancel?: () => void;
};

function compositeId(objId: string, actId: string) { return `${objId}::${actId}`; }
function splitComposite(id: string) { const [o, a] = id.split("::"); return { objId: o, actId: a }; }

// Drag handle for group (object-level)
function GroupDragHandle({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab active:cursor-grabbing p-1 rounded ${isDragging ? "bg-muted/50" : ""}`}
      title="Arrastrar objeto"
      role="button"
      aria-label="Arrastrar objeto"
    >
      <GripVertical className="w-4 h-4 text-muted-foreground" />
    </span>
  );
}

function SortableAction({ item, disabled, onRemove, onAdd }: { item: ActionItem; disabled?: boolean; onRemove?: () => void; onAdd?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <TableRow ref={setNodeRef} style={style} className="hover:bg-muted/40">
      <TableCell className="w-8">
        <button className="cursor-grab active:cursor-grabbing p-1" {...(!disabled ? { ...listeners, ...attributes } : {})}>
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>
      </TableCell>
      <TableCell className="font-medium">{item.label}</TableCell>
      <TableCell className="text-right w-20">
        {onAdd ? (
          <Button size="sm" variant="secondary" onClick={onAdd}>
            <Plus className="w-4 h-4" />
          </Button>
        ) : null}
        {onRemove ? (
          <Button size="sm" variant="outline" className="ml-2" onClick={onRemove}>
            <X className="w-4 h-4" />
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function DroppableContainer({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className || ""} ${isOver ? "ring-2 ring-primary/50 bg-muted/30" : ""}`}>{children}</div>
  );
}

export default function FuncionalidadForm({ mode = "create", initialData, objects: objectsProp, objetosQuery, aplicacionId, onSubmit, onCancel }: FuncionalidadFormProps) {
  // Campos principales
  const [nombre, setNombre] = useState(initialData?.nombre ?? "");
  const [estado, setEstado] = useState<EstadoCode>(initialData?.estado ?? "A");
  const [esPublico, setEsPublico] = useState(initialData?.esPublico ?? false);
  const [soloRoot, setSoloRoot] = useState(initialData?.soloRoot ?? false);
  const [rango, setRango] = useState<DateRange>(initialData?.rango ?? {});
  const [mostrarCalendario, setMostrarCalendario] = useState(false);

  // Objetos: si vienen por props se usan tal cual; si no, se consultan a la API
  const [objects, setObjects] = useState<ObjectItem[]>(objectsProp ?? []);

  // selected: objId -> list of actionIds
  const [selected, setSelected] = useState<Record<string, string[]>>(initialData?.selected ?? {});
  const [filterRight, setFilterRight] = useState("");
  const [filterLeft, setFilterLeft] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openLeft, setOpenLeft] = useState<string[]>([]);
  const [openRight, setOpenRight] = useState<string[]>([]);
  // Paginación por lado (cliente)
  const [leftPageIndex, setLeftPageIndex] = useState(0);
  const [rightPageIndex, setRightPageIndex] = useState(0);
  const groupPageSize = 8;

  // Si cambian las props de objetos, sincronizar estado local
  useEffect(() => {
    if (objectsProp && objectsProp.length) setObjects(objectsProp);
  }, [objectsProp]);

  // Carga desde API /listarObjetos cuando no vienen por props
  useEffect(() => {
    if (objectsProp && objectsProp.length) return; // usar props
    const ac = new AbortController();
    (async () => {
      try {
        const appId = aplicacionId ?? process.env.NEXT_PUBLIC_APLICACION_ID ?? 1;
        const res = await apiListarObjetos(
          { AplicacionId: appId, sinMenu: true },
          { signal: ac.signal },
        );
        const raw = (res?.sdtListaObjetos || []) as any[];
        const normalized: ObjectItem[] = raw.map((o: any) => {
          const objId = String(o?.ObjetoId ?? o?.id ?? "");
          const label = String(o?.ObjetoKey ?? o?.ObjetoLabel ?? o?.ObjetoNombre ?? objId);
          const key = String(o?.ObjetoKey ?? `obj_${objId}`);
          const accionesSrc = (o?.Acciones ?? []) as any[];
          const actions: ActionItem[] = Array.isArray(accionesSrc)
            ? accionesSrc.map((a: any, j: number) => {
                const id = String(a?.AccionId ?? j + 1);
                const key = String(a?.AccionKey ?? a?.AccionCodigo ?? `accion_${j + 1}`);
                // fallback seguro: muestra AccionLabel || AccionDescripcion || AccionKey
                const rawLabel = (a?.AccionLabel ?? "").toString().trim();
                const rawDesc = (a?.AccionDescripcion ?? "").toString().trim();
                const label = rawLabel || rawDesc || key;
                const path = String(a?.AccionPath ?? "");
                return { id, key, label, path };
              })
            : [];
          // intentar obtener path del objeto o de la primera acción con path
          const path = String(o?.ObjetoPath ?? "") || (accionesSrc.find((a: any) => a?.AccionPath)?.AccionPath ?? "");
          return { id: objId, key, label, path, actions };
        });
        // Ordenar por path ascendente (los que no tienen path al final), luego por label
        normalized.sort((a, b) => {
          const pa = (a.path || "").toLowerCase();
          const pb = (b.path || "").toLowerCase();
          if (pa && pb) return pa.localeCompare(pb);
          if (pa) return -1;
          if (pb) return 1;
          return a.label.toLowerCase().localeCompare(b.label.toLowerCase());
        });
        setObjects(normalized);
      } catch (e: any) {
        if (e?.name !== "AbortError") console.error("Error cargando listarObjetos:", e);
      }
    })();
    return () => ac.abort();
  }, [aplicacionId, objectsProp]);

  // Reset de página cuando cambia filtro
  useEffect(() => { setLeftPageIndex(0); }, [filterLeft, objects]);
  useEffect(() => { setRightPageIndex(0); }, [filterRight, selected, objects]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  function addSelection(objId: string, actId: string) {
    setSelected((prev) => {
      const arr = prev[objId] ? [...prev[objId]] : [];
      if (!arr.includes(actId)) arr.push(actId);
      return { ...prev, [objId]: arr };
    });
  }
  function removeSelection(objId: string, actId: string) {
    setSelected((prev) => {
      const arr = (prev[objId] || []).filter((x) => x !== actId);
      const next = { ...prev } as Record<string, string[]>;
      if (arr.length) next[objId] = arr; else delete next[objId];
      return next;
    });
  }

  function addAllOfObject(objId: string) {
    const obj = objects.find((o) => o.id === objId);
    if (!obj) return;
    setSelected((prev) => ({ ...prev, [objId]: Array.from(new Set([...(prev[objId] || []), ...obj.actions.map((a) => a.id)])) }));
  }
  function removeAllOfObject(objId: string) {
    setSelected((prev) => {
      const next = { ...prev } as Record<string, string[]>;
      delete next[objId];
      return next;
    });
  }

  // Filtrado y grupos visibles
  const leftGroups = useMemo(() => {
    const q = filterLeft.trim().toLowerCase();
    return objects
      .map((o) => {
        const acts = q
          ? o.actions.filter((a) =>
              a.label.toLowerCase().includes(q) ||
              a.key.toLowerCase().includes(q) ||
              (a.path || "").toLowerCase().includes(q),
            )
          : o.actions;
        const includeObj = q
          ? (
              o.label.toLowerCase().includes(q) ||
              o.key.toLowerCase().includes(q) ||
              (o.path || "").toLowerCase().includes(q) ||
              acts.length > 0
            )
          : true;
        return includeObj ? { object: o, actions: acts } : null;
      })
      .filter(Boolean) as { object: ObjectItem; actions: ActionItem[] }[];
  }, [objects, filterLeft]);

  const rightGroups = useMemo(() => {
    const q = filterRight.trim().toLowerCase();
    const groups = Object.entries(selected).map(([objId, actIds]) => {
      const obj = objects.find((o) => o.id === objId);
      if (!obj) return null;
      const actsFull = obj.actions.filter((a) => actIds.includes(a.id));
      const acts = q
        ? actsFull.filter((a) =>
            a.label.toLowerCase().includes(q) ||
            a.key.toLowerCase().includes(q) ||
            (a.path || "").toLowerCase().includes(q),
          )
        : actsFull;
      const includeObj = q
        ? (
            obj.label.toLowerCase().includes(q) ||
            obj.key.toLowerCase().includes(q) ||
            (obj.path || "").toLowerCase().includes(q) ||
            acts.length > 0
          )
        : acts.length > 0;
      return includeObj ? { object: obj, actions: acts } : null;
    });
    return (groups.filter(Boolean) as { object: ObjectItem; actions: ActionItem[] }[]).sort(
      (a, b) => a.object.label.localeCompare(b.object.label),
    );
  }, [selected, objects, filterRight]);

  // Paginados
  const leftTotalPages = Math.max(1, Math.ceil(leftGroups.length / groupPageSize));
  const rightTotalPages = Math.max(1, Math.ceil(rightGroups.length / groupPageSize));
  const leftPaged = useMemo(() => {
    const start = leftPageIndex * groupPageSize;
    return leftGroups.slice(start, start + groupPageSize);
  }, [leftGroups, leftPageIndex]);
  const rightPaged = useMemo(() => {
    const start = rightPageIndex * groupPageSize;
    return rightGroups.slice(start, start + groupPageSize);
  }, [rightGroups, rightPageIndex]);

  const leftIds = useMemo(() => leftPaged.flatMap((g) => g.actions.map((a) => compositeId(g.object.id, a.id))), [leftPaged]);
  const rightIds = useMemo(() => rightPaged.flatMap((g) => g.actions.map((a) => compositeId(g.object.id, a.id))), [rightPaged]);

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) { setActiveId(null); return; }
    const src = String(active.id);
    const overId = String(over.id);

    // Destino
    const toRight = overId === "right" || rightIds.includes(overId);
    const toLeft = overId === "left" || leftIds.includes(overId);

    if (src.startsWith("group::")) {
      const objId = src.slice("group::".length);
      if (toRight) {
        // Agregar todas las acciones del objeto
        const obj = objects.find((o) => o.id === objId);
        if (obj) obj.actions.forEach((a) => addSelection(obj.id, a.id));
      } else if (toLeft) {
        // Quitar todas las acciones seleccionadas del objeto
        setSelected((prev) => {
          const next = { ...prev } as Record<string, string[]>;
          delete next[objId];
          return next;
        });
      }
    } else {
      const { objId, actId } = splitComposite(src);
      if (toRight) {
        addSelection(objId, actId);
      } else if (toLeft) {
        removeSelection(objId, actId);
      }
    }
    setActiveId(null);
  }

  // Item activo para overlay
  const activeItem = useMemo(() => {
    if (!activeId) return null as null | { object: ObjectItem; action: ActionItem };
    if (activeId.startsWith("group::")) return null;
    const { objId, actId } = splitComposite(activeId);
    const obj = objects.find((o) => o.id === objId);
    const action = obj?.actions.find((a) => a.id === actId);
    return obj && action ? { object: obj, action } : null;
  }, [activeId, objects]);

  const activeGroup = useMemo(() => {
    if (!activeId || !activeId.startsWith("group::")) return null as null | ObjectItem;
    const objId = activeId.slice("group::".length);
    return objects.find((o) => o.id === objId) || null;
  }, [activeId, objects]);

  // Render helpers
  const renderLeftGroup = (g: { object: ObjectItem; actions: ActionItem[] }) => (
    <AccordionItem key={g.object.id} value={g.object.id}>
      <AccordionTrigger asChild onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} className="justify-between">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <GroupDragHandle id={`group::${g.object.id}`} />
            <div className="flex flex-col">
              <span className="font-medium">{g.object.label}</span>
              {g.object.path ? (
                <span className="text-xs text-muted-foreground tabular-nums">{g.object.path}</span>
              ) : null}
            </div>
            <span className="text-xs text-muted-foreground">({g.actions.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="secondary" title="Agregar todo" onClick={(e) => { e.preventDefault(); e.stopPropagation(); addAllOfObject(g.object.id); }}>
              →
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenLeft((prev) => (prev.includes(g.object.id) ? prev.filter((x) => x !== g.object.id) : [...prev, g.object.id])); }}
              aria-label="Expandir"
            >
              +
            </Button>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <Table>
          <TableBody>
            {g.actions.map((a) => (
              <SortableAction
                key={compositeId(g.object.id, a.id)}
                item={{ id: compositeId(g.object.id, a.id), key: a.key, label: `${a.label}` }}
                onAdd={() => addSelection(g.object.id, a.id)}
              />
            ))}
          </TableBody>
        </Table>
      </AccordionContent>
    </AccordionItem>
  );

  const renderRightGroup = (g: { object: ObjectItem; actions: ActionItem[] }) => (
    <AccordionItem key={g.object.id} value={g.object.id}>
      <AccordionTrigger asChild onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} className="justify-between">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <GroupDragHandle id={`group::${g.object.id}`} />
            <div className="flex flex-col">
              <span className="font-medium">{g.object.label}</span>
              {g.object.path ? (
                <span className="text-xs text-muted-foreground tabular-nums">{g.object.path}</span>
              ) : null}
            </div>
            <span className="text-xs text-muted-foreground">({g.actions.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" title="Quitar todo" onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeAllOfObject(g.object.id); }}>
              ←
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenRight((prev) => (prev.includes(g.object.id) ? prev.filter((x) => x !== g.object.id) : [...prev, g.object.id])); }}
              aria-label="Expandir"
            >
              +
            </Button>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <Table>
          <TableBody>
            {g.actions.map((a) => (
              <SortableAction
                key={compositeId(g.object.id, a.id)}
                item={{ id: compositeId(g.object.id, a.id), key: a.key, label: `${a.label}` }}
                onRemove={() => removeSelection(g.object.id, a.id)}
              />
            ))}
          </TableBody>
        </Table>
      </AccordionContent>
    </AccordionItem>
  );

  const handleSubmit = () => {
    const payload: FuncionalidadData = {
      id: initialData?.id,
      nombre,
      estado,
      esPublico,
      soloRoot,
      rango,
      selected,
    };
    onSubmit?.(payload);
  };

  return (
    <div className="container mx-auto max-w-screen-2xl p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{mode === "edit" ? "Editar funcionalidad" : "Nueva funcionalidad"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Fila 1: Nombre (8) - Estado (2) - Es público (2) */}
            <div className="md:col-span-8 space-y-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la funcionalidad" />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="estado">Estado</Label>
              <Select value={estado} onValueChange={(v: EstadoCode) => setEstado(v)}>
                <SelectTrigger id="estado">
                  <SelectValue placeholder="Estado">{estado === "A" ? "Activo" : "Inactivo"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Activo</SelectItem>
                  <SelectItem value="I">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="publico">Es público</Label>
              <div className="h-9 flex items-center">
                <Switch id="publico" checked={esPublico} onCheckedChange={setEsPublico} />
              </div>
            </div>

            {/* Fila 2: Vigencia (8) - Solo root (4) */}
            <div className="md:col-span-8 space-y-2">
              <Label>Vigencia (desde – hasta)</Label>
              <div className="relative">
                <Input
                  readOnly
                  value={rango.from && rango.to ? `${format(rango.from, "dd/MM/yyyy")} — ${format(rango.to, "dd/MM/yyyy")}` : "Seleccioná rango"}
                  onClick={() => setMostrarCalendario((v) => !v)}
                />
                {mostrarCalendario ? (
                  <div className="absolute z-50 mt-2 rounded-md border bg-popover p-2 shadow-md">
                    <DayPicker
                      mode="range"
                      selected={rango as any}
                      onSelect={(r: any) => setRango(r || {})}
                      numberOfMonths={2}
                      modifiersStyles={{
                        range_start: {
                          background: "rgba(148, 163, 184, 0.12)",
                          color: "inherit",
                          borderTopLeftRadius: "9999px",
                          borderBottomLeftRadius: "9999px",
                        },
                        range_end: {
                          color: "inherit",
                          borderTopRightRadius: "9999px",
                          borderBottomRightRadius: "9999px",
                          background: "rgba(148, 163, 184, 0.12)",
                        },
                        range_middle: {
                          background: "rgba(148, 163, 184, 0.12)",
                          color: "inherit",
                          borderRadius: 0,
                        },
                      }}
                    />
                    <div className="flex justify-end gap-2 p-2">
                      <Button size="sm" variant="outline" onClick={() => { setRango({}); setMostrarCalendario(false); }}>Limpiar</Button>
                      <Button size="sm" onClick={() => setMostrarCalendario(false)}>OK</Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="md:col-span-4 space-y-2">
              <Label htmlFor="soloRoot">Solo modificable por root</Label>
              <div className="h-9 flex items-center">
                <Switch id="soloRoot" checked={soloRoot} onCheckedChange={setSoloRoot} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Izquierda: Objetos y acciones disponibles */}
          <Card>
            <CardHeader className="space-y-2">
              <CardTitle>Disponibles</CardTitle>
              <Input placeholder="Filtrar objetos/acciones..." value={filterLeft} onChange={(e) => setFilterLeft(e.target.value)} />
            </CardHeader>
            <CardContent>
              <DroppableContainer id="left" className="border rounded-md p-2">
                <SortableContext items={leftIds} strategy={verticalListSortingStrategy}>
                  <Accordion type="multiple" value={openLeft} onValueChange={(v) => setOpenLeft(v as string[])}>
                    {leftPaged.map((g) => renderLeftGroup(g))}
                  </Accordion>
                </SortableContext>
              </DroppableContainer>
              <div className="flex items-center justify-between pt-2">
                <span>Página {leftPageIndex + 1} de {leftTotalPages}</span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setLeftPageIndex(0)} disabled={leftPageIndex === 0}>«</Button>
                  <Button type="button" variant="outline" onClick={() => setLeftPageIndex((p) => Math.max(0, p - 1))} disabled={leftPageIndex === 0}>‹</Button>
                  <Button type="button" variant="outline" onClick={() => setLeftPageIndex((p) => Math.min(leftTotalPages - 1, p + 1))} disabled={leftPageIndex >= leftTotalPages - 1}>›</Button>
                  <Button type="button" variant="outline" onClick={() => setLeftPageIndex(leftTotalPages - 1)} disabled={leftPageIndex >= leftTotalPages - 1}>»</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Derecha: Objetos y acciones seleccionadas */}
          <Card>
            <CardHeader className="space-y-2">
              <CardTitle>En la funcionalidad</CardTitle>
              <Input placeholder="Filtrar objetos/acciones..." value={filterRight} onChange={(e) => setFilterRight(e.target.value)} />
            </CardHeader>
            <CardContent>
              <DroppableContainer id="right" className="border rounded-md p-2">
                <SortableContext items={rightIds} strategy={verticalListSortingStrategy}>
                  <Accordion type="multiple" value={openRight} onValueChange={(v) => setOpenRight(v as string[])}>
                    {rightPaged.map((g) => renderRightGroup(g))}
                  </Accordion>
                </SortableContext>
              </DroppableContainer>
              <div className="flex items-center justify-between pt-2">
                <span>Página {rightPageIndex + 1} de {rightTotalPages}</span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setRightPageIndex(0)} disabled={rightPageIndex === 0}>«</Button>
                  <Button type="button" variant="outline" onClick={() => setRightPageIndex((p) => Math.max(0, p - 1))} disabled={rightPageIndex === 0}>‹</Button>
                  <Button type="button" variant="outline" onClick={() => setRightPageIndex((p) => Math.min(rightTotalPages - 1, p + 1))} disabled={rightPageIndex >= rightTotalPages - 1}>›</Button>
                  <Button type="button" variant="outline" onClick={() => setRightPageIndex(rightTotalPages - 1)} disabled={rightPageIndex >= rightTotalPages - 1}>»</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <DragOverlay>
          {activeItem ? (
            <div className="px-3 py-2 bg-card border rounded-md shadow-md flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{activeItem.object.label} — {activeItem.action.label}</span>
            </div>
          ) : activeGroup ? (
            <div className="px-3 py-2 bg-card border rounded-md shadow-md flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{activeGroup.label}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onCancel?.()}>Cancelar</Button>
        <Button onClick={handleSubmit}>{mode === "edit" ? "Guardar cambios" : "Guardar"}</Button>
      </div>
    </div>
  );
}
