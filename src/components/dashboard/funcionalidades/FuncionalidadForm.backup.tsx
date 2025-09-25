"use client";

import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Plus, X, Filter, Search, RefreshCw, Settings, Eye, EyeOff } from "lucide-react";
import { DndContext, DragEndEvent, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, useDroppable, DragOverlay, useDraggable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { format } from "date-fns";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { apiListarObjetos } from "@/services/api";

const APP_OPTIONS = [
  { value: "1", label: "Security Suite" },
  { value: "2", label: "Gestión de Sistemas" },
  { value: "3", label: "GOYA" },
  { value: "4", label: "SGM" },
] as const;

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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  
  return (
    <TableRow 
      ref={setNodeRef} 
      style={style} 
      className={`hover:bg-muted/40 transition-all duration-200 ${isDragging ? 'opacity-50 shadow-lg' : ''}`}
    >
      <TableCell className="w-8">
        <button 
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted transition-colors" 
          {...(!disabled ? { ...listeners, ...attributes } : {})}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <span>{item.label}</span>
          {item.path && (
            <Badge variant="outline" className="text-xs">
              {item.path}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right w-20">
        {onAdd ? (
          <Button 
            size="sm" 
            variant="secondary" 
            onClick={onAdd}
            className="hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            <Plus className="w-4 h-4" />
          </Button>
        ) : null}
        {onRemove ? (
          <Button 
            size="sm" 
            variant="outline" 
            className="ml-2 hover:bg-destructive hover:text-destructive-foreground transition-colors" 
            onClick={onRemove}
          >
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

  // Nueva funcionalidad: Selector de aplicación
  const [selectedApp, setSelectedApp] = useState(
    aplicacionId ? String(aplicacionId) : 
    process.env.NEXT_PUBLIC_APLICACION_ID ? String(process.env.NEXT_PUBLIC_APLICACION_ID) : "1"
  );
  const [isLoadingObjects, setIsLoadingObjects] = useState(false);

  // Objetos: si vienen por props se usan tal cual; si no, se consultan a la API
  const [objects, setObjects] = useState<ObjectItem[]>(objectsProp ?? []);

  // selected: objId -> list of actionIds
  const [selected, setSelected] = useState<Record<string, string[]>>(initialData?.selected ?? {});
  const [filterRight, setFilterRight] = useState("");
  const [filterLeft, setFilterLeft] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openLeft, setOpenLeft] = useState<string[]>([]);
  const [openRight, setOpenRight] = useState<string[]>([]);
  
  // Mejoras modernas: Vista expandida
  const [showDetails, setShowDetails] = useState(false);
  
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
    
    const loadObjects = async () => {
      if (!selectedApp) return;
      
      setIsLoadingObjects(true);
      setObjects([]); // Limpiar objetos anteriores
      setSelected({}); // Limpiar selección al cambiar app
      
      try {
        const res = await apiListarObjetos(
          { AplicacionId: Number(selectedApp), sinMenu: true }
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
                const rawLabel = (a?.AccionLabel ?? "").toString().trim();
                const rawDesc = (a?.AccionDescripcion ?? "").toString().trim();
                const label = rawLabel || rawDesc || key;
                const path = String(a?.AccionPath ?? "");
                return { id, key, label, path };
              })
            : [];
          const path = String(o?.ObjetoPath ?? "") || (accionesSrc.find((a: any) => a?.AccionPath)?.AccionPath ?? "");
          return { id: objId, key, label, path, actions };
        });
        
        // Ordenar por path ascendente, luego por label
        normalized.sort((a, b) => {
          const pa = (a.path || "").toLowerCase();
          const pb = (b.path || "").toLowerCase();
          if (pa && pb) return pa.localeCompare(pb);
          if (pa) return -1;
          if (pb) return 1;
          return a.label.toLowerCase().localeCompare(b.label.toLowerCase());
        });
        
        setObjects(normalized);
      } catch (error) {
        console.error("Error cargando objetos:", error);
        setObjects([]);
      } finally {
        setIsLoadingObjects(false);
      }
    };

    loadObjects();
  }, [selectedApp, objectsProp]);

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
      {/* Header modernizado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {mode === "edit" ? "Editar funcionalidad" : "Nueva funcionalidad"}
          </h1>
          <p className="text-muted-foreground">
            Configure los permisos y objetos para esta funcionalidad
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
            className="gap-2"
          >
            {showDetails ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showDetails ? "Ocultar detalles" : "Mostrar detalles"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Configuración principal */}
      <Card className="border-2">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Configuración General
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-6">
            {/* Fila 1: Aplicación y Nombre */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-4 space-y-2">
                <Label htmlFor="aplicacion" className="text-sm font-semibold">
                  Aplicación *
                </Label>
                <Select value={selectedApp} onValueChange={setSelectedApp}>
                  <SelectTrigger id="aplicacion" className="border-2">
                    <SelectValue placeholder="Seleccionar aplicación" />
                  </SelectTrigger>
                  <SelectContent>
                    {APP_OPTIONS.map((app) => (
                      <SelectItem key={app.value} value={app.value}>
                        {app.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isLoadingObjects && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Cargando objetos...
                  </p>
                )}
              </div>

              <div className="md:col-span-8 space-y-2">
                <Label htmlFor="nombre" className="text-sm font-semibold">
                  Nombre de la funcionalidad *
                </Label>
                <Input 
                  id="nombre" 
                  value={nombre} 
                  onChange={(e) => setNombre(e.target.value)} 
                  placeholder="Ej: Gestión de usuarios, Reportes administrativos..."
                  className="border-2"
                />
              </div>
            </div>

            {/* Fila 2: Estado y Configuraciones */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="estado" className="text-sm font-semibold">Estado</Label>
                <Select value={estado} onValueChange={(v: EstadoCode) => setEstado(v)}>
                  <SelectTrigger id="estado" className="border-2">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        Activo
                      </div>
                    </SelectItem>
                    <SelectItem value="I">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                        Inactivo
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-3 space-y-3">
                <Label className="text-sm font-semibold">Visibilidad</Label>
                <div className="flex items-center gap-3">
                  <Switch 
                    id="publico" 
                    checked={esPublico} 
                    onCheckedChange={setEsPublico}
                    className="data-[state=checked]:bg-blue-600"
                  />
                  <Label htmlFor="publico" className="text-sm cursor-pointer">
                    Funcionalidad pública
                  </Label>
                </div>
              </div>

              <div className="md:col-span-3 space-y-3">
                <Label className="text-sm font-semibold">Restricciones</Label>
                <div className="flex items-center gap-3">
                  <Switch 
                    id="soloRoot" 
                    checked={soloRoot} 
                    onCheckedChange={setSoloRoot}
                    className="data-[state=checked]:bg-orange-600"
                  />
                  <Label htmlFor="soloRoot" className="text-sm cursor-pointer">
                    Solo modificable por root
                  </Label>
                </div>
              </div>

              <div className="md:col-span-4 space-y-2">
                <Label className="text-sm font-semibold">Vigencia</Label>
                <div className="relative">
                  <Input
                    readOnly
                    value={rango.from && rango.to ? `${format(rango.from, "dd/MM/yyyy")} — ${format(rango.to, "dd/MM/yyyy")}` : "Sin restricción de fechas"}
                    onClick={() => setMostrarCalendario((v) => !v)}
                    className="border-2 cursor-pointer"
                    placeholder="Seleccionar rango de fechas"
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

            {/* Información adicional cuando showDetails está activado */}
            {showDetails && (
              <div className="border-t pt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <Label className="font-semibold">Objetos disponibles:</Label>
                    <Badge variant="secondary" className="ml-2">
                      {objects.length}
                    </Badge>
                  </div>
                  <div>
                    <Label className="font-semibold">Objetos seleccionados:</Label>
                    <Badge variant="secondary" className="ml-2">
                      {Object.keys(selected).length}
                    </Badge>
                  </div>
                  <div>
                    <Label className="font-semibold">Acciones totales:</Label>
                    <Badge variant="secondary" className="ml-2">
                      {Object.values(selected).reduce((acc, actions) => acc + actions.length, 0)}
                    </Badge>
                  </div>
                </div>
              </div>
            )}
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Izquierda: Objetos y acciones disponibles */}
          <Card className="border-2">
            <CardHeader className="border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Filter className="w-5 h-5" />
                  Objetos Disponibles
                  <Badge variant="outline" className="ml-2">
                    {leftGroups.length}
                  </Badge>
                </CardTitle>
                {isLoadingObjects && (
                  <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar objetos, acciones o rutas..." 
                  value={filterLeft} 
                  onChange={(e) => setFilterLeft(e.target.value)}
                  className="pl-10 border-2"
                />
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <DroppableContainer 
                id="left" 
                className="border-2 border-dashed rounded-lg p-4 min-h-[400px] transition-all duration-200"
              >
                <SortableContext items={leftIds} strategy={verticalListSortingStrategy}>
                  <Accordion type="multiple" value={openLeft} onValueChange={(v) => setOpenLeft(v as string[])}>
                    {leftPaged.length > 0 ? (
                      leftPaged.map((g) => renderLeftGroup(g))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Filter className="w-12 h-12 mb-4 opacity-50" />
                        <p className="text-sm">
                          {filterLeft ? 'No se encontraron resultados' : 'No hay objetos disponibles'}
                        </p>
                        {filterLeft && (
                          <Button 
                            variant="link" 
                            size="sm" 
                            onClick={() => setFilterLeft("")}
                            className="mt-2"
                          >
                            Limpiar filtro
                          </Button>
                        )}
                      </div>
                    )}
                  </Accordion>
                </SortableContext>
              </DroppableContainer>
              
              {/* Paginación modernizada */}
              {leftTotalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <span className="text-sm text-muted-foreground">
                    Página {leftPageIndex + 1} de {leftTotalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setLeftPageIndex(0)} 
                      disabled={leftPageIndex === 0}
                    >
                      ««
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setLeftPageIndex((p) => Math.max(0, p - 1))} 
                      disabled={leftPageIndex === 0}
                    >
                      ‹
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setLeftPageIndex((p) => Math.min(leftTotalPages - 1, p + 1))} 
                      disabled={leftPageIndex >= leftTotalPages - 1}
                    >
                      ›
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setLeftPageIndex(leftTotalPages - 1)} 
                      disabled={leftPageIndex >= leftTotalPages - 1}
                    >
                      »»
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Derecha: Objetos y acciones seleccionadas */}
          <Card className="border-2">
            <CardHeader className="border-b bg-muted/30">
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                En la Funcionalidad
                <Badge variant="default" className="ml-2">
                  {rightGroups.length}
                </Badge>
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Filtrar seleccionados..." 
                  value={filterRight} 
                  onChange={(e) => setFilterRight(e.target.value)}
                  className="pl-10 border-2"
                />
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <DroppableContainer 
                id="right" 
                className="border-2 border-dashed rounded-lg p-4 min-h-[400px] transition-all duration-200"
              >
                <SortableContext items={rightIds} strategy={verticalListSortingStrategy}>
                  <Accordion type="multiple" value={openRight} onValueChange={(v) => setOpenRight(v as string[])}>
                    {rightPaged.length > 0 ? (
                      rightPaged.map((g) => renderRightGroup(g))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Settings className="w-12 h-12 mb-4 opacity-50" />
                        <p className="text-sm text-center">
                          {filterRight ? 'No se encontraron resultados' : 'Arrastra objetos aquí para incluirlos en la funcionalidad'}
                        </p>
                        {filterRight && (
                          <Button 
                            variant="link" 
                            size="sm" 
                            onClick={() => setFilterRight("")}
                            className="mt-2"
                          >
                            Limpiar filtro
                          </Button>
                        )}
                      </div>
                    )}
                  </Accordion>
                </SortableContext>
              </DroppableContainer>
              
              {/* Paginación modernizada */}
              {rightTotalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <span className="text-sm text-muted-foreground">
                    Página {rightPageIndex + 1} de {rightTotalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setRightPageIndex(0)} 
                      disabled={rightPageIndex === 0}
                    >
                      ««
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setRightPageIndex((p) => Math.max(0, p - 1))} 
                      disabled={rightPageIndex === 0}
                    >
                      ‹
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setRightPageIndex((p) => Math.min(rightTotalPages - 1, p + 1))} 
                      disabled={rightPageIndex >= rightTotalPages - 1}
                    >
                      ›
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setRightPageIndex(rightTotalPages - 1)} 
                      disabled={rightPageIndex >= rightTotalPages - 1}
                    >
                      »»
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DragOverlay>
          {activeItem ? (
            <div className="px-4 py-3 bg-card border-2 rounded-lg shadow-lg flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{activeItem.object.label} — {activeItem.action.label}</span>
            </div>
          ) : activeGroup ? (
            <div className="px-4 py-3 bg-card border-2 rounded-lg shadow-lg flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{activeGroup.label}</span>
              <Badge variant="secondary">Grupo</Badge>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Botones de acción modernizados */}
      <Card className="border-2">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {Object.keys(selected).length > 0 ? (
                <span>
                  Se han configurado <strong>{Object.keys(selected).length}</strong> objetos con{" "}
                  <strong>{Object.values(selected).reduce((acc, actions) => acc + actions.length, 0)}</strong> acciones
                </span>
              ) : (
                <span>No se han seleccionado objetos para esta funcionalidad</span>
              )}
            </div>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => onCancel?.()}
                className="min-w-[100px]"
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleSubmit}
                className="min-w-[120px] bg-primary hover:bg-primary/90"
                disabled={!nombre.trim() || Object.keys(selected).length === 0}
              >
                {mode === "edit" ? "Guardar cambios" : "Crear funcionalidad"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
