"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Users, Shield, Lock, Save } from "lucide-react";
import {
  apiAplicacionesDB,
  apiFuncionalidadesDB,
  apiCrearRolDB,
  apiActualizarRolDB,
} from "@/services/api";

export type EstadoCode = "A" | "I";

// Tipos para drag and drop de funcionalidades
export interface FuncionalidadItem {
  id: string;
  nombre: string;
  descripcion: string;
  objetosCount: number;
  accionesCount: number;
}

export type RolFormState = {
  rolid: string; // identificador oculto
  rolnombre: string; // rol (string)
  roldescripcion: string; // Descripcion (string)
  rolestado: EstadoCode; // Estado (A/I)
  rolnivel: number; // Nivel (numeric)
  rolfchins: string; // Fch Ingreso ISO, oculto
  aplicacionid: string; // 2 o 3
  rolcreadoen: string; // descripción de la app elegida, oculto
};

export type RoleFormProps = {
  initialData?: Partial<RolFormState>;
  initialFuncionalidades?: FuncionalidadItem[];
  /**
   * Callback opcional invocado DESPUÉS de que el guardado a PostgreSQL fue exitoso.
   * Recibe el estado del formulario y las funcionalidades asignadas (drag-and-drop).
   * Permite que componentes padre (ej: EditRoleForm) realicen dual-write a GeneXus.
   * Si no se provee, el formulario navega a /dashboard/roles automáticamente.
   */
  onSubmit?: (data: RolFormState, funcionalidades: FuncionalidadItem[]) => void | Promise<void>;
};

export default function RoleForm({
  initialData,
  initialFuncionalidades,
  onSubmit,
}: RoleFormProps) {
  const router = useRouter();

  // Aplicaciones dinámicas desde DB
  const [appOptions, setAppOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    apiAplicacionesDB({ pageSize: 999, estado: "A" })
      .then((res) =>
        setAppOptions(
          (res.items || []).map((a: any) => ({ value: String(a.id), label: a.nombre }))
        )
      )
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialApp = appOptions[0] ?? { value: "", label: "" };

  const defaults: RolFormState = {
    rolid: "",
    rolnombre: "",
    roldescripcion: "",
    rolestado: "A",
    rolnivel: 0,
    rolfchins: new Date().toISOString(),
    aplicacionid: initialApp.value,
    rolcreadoen: initialApp.label,
  };

  const computeCreatedEn = (aplicacionid?: string, rolcreadoen?: string) =>
    rolcreadoen ??
    appOptions.find((a) => a.value === (aplicacionid ?? initialApp.value))
      ?.label ??
    initialApp.label;

  const [form, setForm] = useState<RolFormState>(() => ({
    ...defaults,
    ...(initialData ?? {}),
    rolcreadoen: computeCreatedEn(
      initialData?.aplicacionid,
      initialData?.rolcreadoen,
    ),
  }));

  // Estados para drag and drop de funcionalidades
  const [funcionalidadesDisponibles, setFuncionalidadesDisponibles] = useState<
    FuncionalidadItem[]
  >([]);
  const [funcionalidadesAsignadas, setFuncionalidadesAsignadas] = useState<
    FuncionalidadItem[]
  >(initialFuncionalidades || []);
  const [activeDragItem, setActiveDragItem] =
    useState<FuncionalidadItem | null>(null);
  const [isLoadingFuncionalidades, setIsLoadingFuncionalidades] =
    useState(true);

  // Cargar funcionalidades desde PostgreSQL, filtradas por aplicación seleccionada
  useEffect(() => {
    if (!form.aplicacionid) return;
    const cargarFuncionalidades = async () => {
      try {
        setIsLoadingFuncionalidades(true);
        const response = await apiFuncionalidadesDB({
          aplicacionId: parseInt(form.aplicacionid),
          estado: "A",
          pageSize: 999,
        });
        const asignadasIds = new Set((initialFuncionalidades || []).map((f) => f.id));
        const disponibles: FuncionalidadItem[] = (response.items || [])
          .filter((f) => !asignadasIds.has(String(f.id)))
          .map((f) => ({
            id: String(f.id),
            nombre: f.nombre,
            descripcion: f.objetoKey ? `${f.objetoKey} · ${f.accionKey ?? ""}` : "",
            objetosCount: 0,
            accionesCount: f.acciones?.length ?? 0,
          }));
        setFuncionalidadesDisponibles(disponibles);
      } catch (error) {
        console.error("Error al cargar funcionalidades:", error);
        setFuncionalidadesDisponibles([]);
      } finally {
        setIsLoadingFuncionalidades(false);
      }
    };
    cargarFuncionalidades();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.aplicacionid]);

  // Configuración del sensor para drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    }),
  );

  useEffect(() => {
    if (initialData) {
      setForm({
        ...defaults,
        ...initialData,
        rolcreadoen: computeCreatedEn(
          initialData.aplicacionid,
          initialData.rolcreadoen,
        ),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialData)]);

  const estadoLabel = useMemo(
    () => (form.rolestado === "A" ? "Activo" : "Inactivo"),
    [form.rolestado],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const rolId = parseInt(form.rolid) || 0;
      const dbPayload = {
        aplicacionId: parseInt(form.aplicacionid),
        nombre: form.rolnombre,
        descripcion: form.roldescripcion || undefined,
        estado: form.rolestado,
        nivel: form.rolnivel,
        creadoEn: form.rolcreadoen,
        funcionalidades: funcionalidadesAsignadas.map((func) => ({
          funcionalidadId: parseInt(func.id),
        })),
      };
      if (rolId > 0) {
        await apiActualizarRolDB(rolId, dbPayload);
      } else {
        await apiCrearRolDB(dbPayload);
      }

      // Si el componente padre provee onSubmit, lo invocamos con los datos y funcionalidades
      // (permite dual-write a GeneXus desde EditRoleForm). Si no, navegamos directo.
      if (onSubmit) {
        await onSubmit(form, funcionalidadesAsignadas);
      } else {
        router.push("/dashboard/roles");
      }
    } catch (error) {
      console.error("Error en handleSubmit:", error);
    }
  };

  const handleCancel = () => router.back();

  const setField = <K extends keyof RolFormState>(
    key: K,
    value: RolFormState[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  // Funciones para drag and drop
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const funcionalidad = [
      ...funcionalidadesDisponibles,
      ...funcionalidadesAsignadas,
    ].find((item) => item.id === active.id);
    setActiveDragItem(funcionalidad || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragItem(null);

    console.log("=== DRAG END ===");
    console.log("Active ID:", active.id);
    console.log("Over ID:", over?.id);

    if (!over) {
      console.log("No over target, returning");
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    console.log("Active ID (string):", activeId);
    console.log("Over ID (string):", overId);

    // Buscar el item en ambas listas
    const sourceFromDisponibles = funcionalidadesDisponibles.find(
      (item) => item.id === activeId,
    );
    const sourceFromAsignadas = funcionalidadesAsignadas.find(
      (item) => item.id === activeId,
    );

    console.log("Source from disponibles:", sourceFromDisponibles);
    console.log("Source from asignadas:", sourceFromAsignadas);

    // Determinar en qué zona se soltó el elemento
    // Si se soltó sobre el contenedor droppable directamente
    if (overId === "disponibles-droppable" && sourceFromAsignadas) {
      console.log("Moving from asignadas to disponibles (container drop)");
      setFuncionalidadesAsignadas((prev) =>
        prev.filter((item) => item.id !== activeId),
      );
      setFuncionalidadesDisponibles((prev) => [...prev, sourceFromAsignadas]);
    } else if (overId === "asignadas-droppable" && sourceFromDisponibles) {
      console.log("Moving from disponibles to asignadas (container drop)");
      setFuncionalidadesDisponibles((prev) =>
        prev.filter((item) => item.id !== activeId),
      );
      setFuncionalidadesAsignadas((prev) => [...prev, sourceFromDisponibles]);
    }
    // Si se soltó sobre una funcionalidad específica, determinar a qué zona pertenece
    else {
      const targetInAsignadas = funcionalidadesAsignadas.find(
        (item) => item.id === overId,
      );
      const targetInDisponibles = funcionalidadesDisponibles.find(
        (item) => item.id === overId,
      );

      if (targetInAsignadas && sourceFromDisponibles) {
        console.log("Moving from disponibles to asignadas (element drop)");
        setFuncionalidadesDisponibles((prev) =>
          prev.filter((item) => item.id !== activeId),
        );
        setFuncionalidadesAsignadas((prev) => [...prev, sourceFromDisponibles]);
      } else if (targetInDisponibles && sourceFromAsignadas) {
        console.log("Moving from asignadas to disponibles (element drop)");
        setFuncionalidadesAsignadas((prev) =>
          prev.filter((item) => item.id !== activeId),
        );
        setFuncionalidadesDisponibles((prev) => [...prev, sourceFromAsignadas]);
      } else {
        console.log("No matching condition:", {
          overId,
          hasSourceFromAsignadas: !!sourceFromAsignadas,
          hasSourceFromDisponibles: !!sourceFromDisponibles,
          targetInAsignadas: !!targetInAsignadas,
          targetInDisponibles: !!targetInDisponibles,
        });
      }
    }
  };

  // Componente para cada funcionalidad draggable
  const FuncionalidadCard = ({
    funcionalidad,
  }: {
    funcionalidad: FuncionalidadItem;
  }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({
      id: funcionalidad.id,
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`bg-card border rounded-lg p-3 cursor-grab active:cursor-grabbing
                   hover:shadow-md transition-all duration-200
                   ${isDragging ? "shadow-lg scale-105" : ""}`}
        {...attributes}
        {...listeners}
      >
        <div className="flex items-start gap-3">
          <GripVertical className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <h4 className="font-medium text-sm truncate">
                {funcionalidad.nombre}
              </h4>
            </div>
            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
              {funcionalidad.descripcion}
            </p>
            <div className="flex gap-2">
              <Badge variant="secondary" className="text-xs">
                <Users className="h-3 w-3 mr-1" />
                {funcionalidad.objetosCount} obj
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Lock className="h-3 w-3 mr-1" />
                {funcionalidad.accionesCount} acc
              </Badge>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Componente droppable para las listas
  const DroppableContainer = ({
    id,
    title,
    items,
    icon,
  }: {
    id: string;
    title: string;
    items: FuncionalidadItem[];
    icon: React.ReactNode;
  }) => {
    const { setNodeRef, isOver } = useDroppable({
      id: id,
    });

    return (
      <Card
        ref={setNodeRef}
        className={`h-[400px] ${isOver ? "ring-2 ring-blue-500 bg-blue-50/5" : ""}`}
      >
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {icon}
            {title}
            <Badge variant="secondary" className="ml-auto">
              {items.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2 h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
            <SortableContext
              items={items}
              strategy={verticalListSortingStrategy}
            >
              {items.map((item) => (
                <FuncionalidadCard key={item.id} funcionalidad={item} />
              ))}
            </SortableContext>
            {items.length === 0 && (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {id === "disponibles-droppable"
                      ? "No hay funcionalidades disponibles"
                      : "Arrastra funcionalidades aquí"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto max-w-6xl p-4 space-y-6">
      <form onSubmit={handleSubmit}>
        {/* Hidden fields */}
        <input type="hidden" name="rolid" value={form.rolid} />
        <input type="hidden" name="rolfchins" value={form.rolfchins} />
        <input type="hidden" name="rolcreadoen" value={form.rolcreadoen} />

        <Card>
          <CardHeader>
            <CardTitle>{form.rolid ? "Editar rol" : "Crear rol"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* rolnombre */}
              <div className="space-y-2">
                <Label htmlFor="rolnombre">Rol</Label>
                <Input
                  id="rolnombre"
                  name="rolnombre"
                  value={form.rolnombre}
                  onChange={(e) => setField("rolnombre", e.target.value)}
                  placeholder="Nombre del rol"
                  required
                />
              </div>

              {/* roldescripcion */}
              <div className="space-y-2">
                <Label htmlFor="roldescripcion">Descripción</Label>
                <Textarea
                  id="roldescripcion"
                  name="roldescripcion"
                  value={form.roldescripcion}
                  onChange={(e) => setField("roldescripcion", e.target.value)}
                  placeholder="Descripción del rol"
                />
              </div>

              {/* rolestado */}
              <div className="space-y-2">
                <Label htmlFor="rolestado">Estado</Label>
                <Select
                  value={form.rolestado}
                  onValueChange={(v: EstadoCode) => setField("rolestado", v)}
                >
                  <SelectTrigger id="rolestado">
                    <SelectValue placeholder="Estado">
                      {estadoLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Activo</SelectItem>
                    <SelectItem value="I">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* rolnivel */}
              <div className="space-y-2">
                <Label htmlFor="rolnivel">Nivel</Label>
                <Input
                  id="rolnivel"
                  name="rolnivel"
                  type="number"
                  value={form.rolnivel}
                  onChange={(e) => setField("rolnivel", Number(e.target.value))}
                  min={0}
                />
              </div>

              {/* aplicacionid */}
              <div className="space-y-2">
                <Label htmlFor="aplicacionid">Aplicación</Label>
                <Select
                  value={form.aplicacionid}
                  onValueChange={(v) => {
                    const app =
                      appOptions.find((a) => a.value === v) ?? initialApp;
                    setForm((prev) => ({
                      ...prev,
                      aplicacionid: v,
                      rolcreadoen: app.label,
                    }));
                  }}
                >
                  <SelectTrigger id="aplicacionid">
                    <SelectValue placeholder="Aplicación">
                      {
                        appOptions.find((a) => a.value === form.aplicacionid)
                          ?.label
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {appOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.value} - {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancelar
            </Button>
            <Button type="submit">
              <Save className="h-4 w-4 mr-2" />
              Guardar
            </Button>
          </CardFooter>
        </Card>
      </form>

      {/* Sección Drag and Drop de Funcionalidades */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Asignación de Funcionalidades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Funcionalidades Disponibles */}
              <DroppableContainer
                id="disponibles-droppable"
                title="Funcionalidades Disponibles"
                items={funcionalidadesDisponibles}
                icon={<Shield className="h-4 w-4 text-green-500" />}
              />

              {/* Funcionalidades Asignadas */}
              <DroppableContainer
                id="asignadas-droppable"
                title="Funcionalidades Asignadas"
                items={funcionalidadesAsignadas}
                icon={<Lock className="h-4 w-4 text-blue-500" />}
              />
            </div>
          </CardContent>
        </Card>

        {/* Overlay para mostrar el item siendo arrastrado */}
        <DragOverlay>
          {activeDragItem ? (
            <div className="bg-card border rounded-lg p-3 shadow-lg rotate-3 scale-105">
              <div className="flex items-start gap-3">
                <GripVertical className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    <h4 className="font-medium text-sm truncate">
                      {activeDragItem.nombre}
                    </h4>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                    {activeDragItem.descripcion}
                  </p>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="text-xs">
                      <Users className="h-3 w-3 mr-1" />
                      {activeDragItem.objetosCount} obj
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <Lock className="h-3 w-3 mr-1" />
                      {activeDragItem.accionesCount} acc
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
