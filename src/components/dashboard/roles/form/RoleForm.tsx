"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DndContext, DragEndEvent, DragOverEvent, DragStartEvent, PointerSensor, useSensor, useSensors, DragOverlay, useDroppable, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Users, Shield, Lock, Save } from "lucide-react";
import { apiAbmRoles, apiListarFuncionalidades, AbmRolesReq } from "@/services/api";

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
  onSubmit?: (data: RolFormState) => void | Promise<void>;
};

const APP_OPTIONS = [
  { value: "2", label: "Security Suite" },
  { value: "3", label: "GOYA" },
] as const;

export default function RoleForm({ initialData, onSubmit }: RoleFormProps) {
  const router = useRouter();

  const initialApp = APP_OPTIONS[0];

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
    rolcreadoen ?? (APP_OPTIONS.find((a) => a.value === (aplicacionid ?? initialApp.value))?.label ?? initialApp.label);

  const [form, setForm] = useState<RolFormState>(() => ({
    ...defaults,
    ...(initialData ?? {}),
    rolcreadoen: computeCreatedEn(initialData?.aplicacionid, initialData?.rolcreadoen),
  }));

  // Estados para drag and drop de funcionalidades
  const [funcionalidadesDisponibles, setFuncionalidadesDisponibles] = useState<FuncionalidadItem[]>([]);
  const [funcionalidadesAsignadas, setFuncionalidadesAsignadas] = useState<FuncionalidadItem[]>([]);
  const [activeDragItem, setActiveDragItem] = useState<FuncionalidadItem | null>(null);
  const [isLoadingFuncionalidades, setIsLoadingFuncionalidades] = useState(true);

  // Cargar funcionalidades desde la API
  useEffect(() => {
    const cargarFuncionalidades = async () => {
      try {
        setIsLoadingFuncionalidades(true);
        const response = await apiListarFuncionalidades({
          AplicacionId: parseInt(form.aplicacionid) || 2,
        });

        if (response.sdtFuncionalidades && Array.isArray(response.sdtFuncionalidades)) {
          const funcionalidades: FuncionalidadItem[] = response.sdtFuncionalidades.map((func) => ({
            id: func.FuncionalidadId.toString(),
            nombre: func.FuncionalidadNombre,
            descripcion: "", // La API no tiene descripción disponible
            objetosCount: func.Accion?.length || 0,
            accionesCount: func.Accion?.length || 0,
          }));
          
          setFuncionalidadesDisponibles(funcionalidades);
        } else {
          // Usar datos mock como fallback
          setFuncionalidadesDisponibles([
            {
              id: "1",
              nombre: "Gestión de Usuarios",
              descripcion: "Administración completa de usuarios del sistema",
              objetosCount: 8,
              accionesCount: 24
            },
            {
              id: "2", 
              nombre: "Control de Acceso",
              descripcion: "Configuración de permisos y roles",
              objetosCount: 5,
              accionesCount: 15
            },
            {
              id: "3",
              nombre: "Auditoría y Logs",
              descripcion: "Monitoreo y seguimiento de actividades",
              objetosCount: 3,
              accionesCount: 9
            },
            {
              id: "4",
              nombre: "Configuración Sistema",
              descripcion: "Parámetros generales del sistema",
              objetosCount: 6,
              accionesCount: 18
            },
            {
              id: "5",
              nombre: "Reportes de Seguridad", 
              descripcion: "Generación de informes y estadísticas",
              objetosCount: 4,
              accionesCount: 12
            }
          ]);
        }
      } catch (error) {
        console.error("Error al cargar funcionalidades:", error);
        // En caso de error, usar datos mock como fallback
        setFuncionalidadesDisponibles([
          {
            id: "1",
            nombre: "Gestión de Usuarios",
            descripcion: "Administración completa de usuarios del sistema",
            objetosCount: 8,
            accionesCount: 24
          },
          {
            id: "2", 
            nombre: "Control de Acceso",
            descripcion: "Configuración de permisos y roles",
            objetosCount: 5,
            accionesCount: 15
          },
          {
            id: "3",
            nombre: "Auditoría y Logs",
            descripcion: "Monitoreo y seguimiento de actividades",
            objetosCount: 3,
            accionesCount: 9
          },
          {
            id: "4",
            nombre: "Configuración Sistema",
            descripcion: "Parámetros generales del sistema",
            objetosCount: 6,
            accionesCount: 18
          },
          {
            id: "5",
            nombre: "Reportes de Seguridad", 
            descripcion: "Generación de informes y estadísticas",
            objetosCount: 4,
            accionesCount: 12
          }
        ]);
      } finally {
        setIsLoadingFuncionalidades(false);
      }
    };

    cargarFuncionalidades();
  }, [form.aplicacionid]);

  // Configuración del sensor para drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    })
  );

  useEffect(() => {
    if (initialData) {
      setForm({
        ...defaults,
        ...initialData,
        rolcreadoen: computeCreatedEn(initialData.aplicacionid, initialData.rolcreadoen),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialData)]);

  const estadoLabel = useMemo(() => (form.rolestado === "A" ? "Activo" : "Inactivo"), [form.rolestado]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Construir el payload para la API
      const payload: AbmRolesReq = {
        RolId: parseInt(form.rolid) || 0,
        AplicacionId: parseInt(form.aplicacionid),
        RolNombre: form.rolnombre,
        RolDescripcion: form.roldescripcion,
        RolEstado: form.rolestado,
        RolNivel: form.rolnivel,
        RolFchIns: form.rolfchins,
        RolCreadoEn: form.rolcreadoen,
        Funcionalidad: funcionalidadesAsignadas.map(func => ({
          FuncionalidadId: parseInt(func.id),
          RolFuncionalidadFchIns: new Date().toISOString()
        }))
      };

      console.log("Enviando datos del rol:", payload);
      
      const response = await apiAbmRoles(payload);
      
      if (response.success) {
        console.log("Rol guardado exitosamente:", response);
        // Opcional: mostrar mensaje de éxito y redirigir
        router.push("/dashboard/roles");
      } else {
        console.error("Error al guardar el rol:", response.message);
        // Aquí podrías mostrar un toast de error
      }
      
    } catch (error) {
      console.error("Error en handleSubmit:", error);
      // Aquí podrías mostrar un toast de error
    }
  };

  const handleCancel = () => router.back();

  const setField = <K extends keyof RolFormState>(key: K, value: RolFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Funciones para drag and drop
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const funcionalidad = [...funcionalidadesDisponibles, ...funcionalidadesAsignadas].find(
      (item) => item.id === active.id
    );
    setActiveDragItem(funcionalidad || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragItem(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Buscar el item en ambas listas
    const sourceFromDisponibles = funcionalidadesDisponibles.find((item) => item.id === activeId);
    const sourceFromAsignadas = funcionalidadesAsignadas.find((item) => item.id === activeId);

    if (overId === "disponibles-droppable" && sourceFromAsignadas) {
      // Mover de asignadas a disponibles
      setFuncionalidadesAsignadas((prev) => prev.filter((item) => item.id !== activeId));
      setFuncionalidadesDisponibles((prev) => [...prev, sourceFromAsignadas]);
    } else if (overId === "asignadas-droppable" && sourceFromDisponibles) {
      // Mover de disponibles a asignadas
      setFuncionalidadesDisponibles((prev) => prev.filter((item) => item.id !== activeId));
      setFuncionalidadesAsignadas((prev) => [...prev, sourceFromDisponibles]);
    }
  };

  // Componente para cada funcionalidad draggable
  const FuncionalidadCard = ({ funcionalidad }: { funcionalidad: FuncionalidadItem }) => {
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
                   ${isDragging ? 'shadow-lg scale-105' : ''}`}
        {...attributes}
        {...listeners}
      >
        <div className="flex items-start gap-3">
          <GripVertical className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <h4 className="font-medium text-sm truncate">{funcionalidad.nombre}</h4>
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
    icon 
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
      <Card className={`h-[400px] ${isOver ? 'ring-2 ring-blue-500 bg-blue-50/5' : ''}`}>
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
          <div
            ref={setNodeRef}
            className="space-y-2 h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600"
          >
            <SortableContext items={items} strategy={verticalListSortingStrategy}>
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
                    <SelectValue placeholder="Estado">{estadoLabel}</SelectValue>
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
                    const app = APP_OPTIONS.find((a) => a.value === v) ?? initialApp;
                    setForm((prev) => ({
                      ...prev,
                      aplicacionid: v,
                      rolcreadoen: app.label,
                    }));
                  }}
                >
                  <SelectTrigger id="aplicacionid">
                    <SelectValue placeholder="Aplicación">
                      {APP_OPTIONS.find((a) => a.value === form.aplicacionid)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {APP_OPTIONS.map((opt) => (
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
                    <h4 className="font-medium text-sm truncate">{activeDragItem.nombre}</h4>
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
