"use client";

import React, { useState, useEffect } from "react";
import {
  Save,
  ArrowLeft,
  GripVertical,
  Plus,
  X,
  Trash2,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
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
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  apiAplicacionesDB,
  apiObjetosDB,
  apiCrearFuncionalidadDB,
  apiActualizarFuncionalidadDB,
  type AplicacionDB,
} from "@/services/api";

// Basic types
export type EstadoCode = "A" | "I";

export interface SortableAction {
  id: string;
  nombre: string;
  codigo: string;
  descripcion: string;
  ruta?: string;
}

export interface Objeto {
  id: string;
  nombre: string;
  codigo: string;
  ruta?: string;
  acciones: SortableAction[];
}

interface FuncionalidadFormProps {
  mode?: "create" | "edit";
  initialData?: {
    id?: string;
    aplicacion?: string;
    nombre?: string;
    estado?: EstadoCode;
    esPublico?: boolean;
    soloRoot?: boolean;
    acciones?: Array<{ AccionId: number; ObjetoId: number }>;
  };
  onSave?: (data: any) => void;
  onCancel?: () => void;
}

/**
 * Formulario para crear/editar funcionalidades
 * Versión simplificada y limpia
 */
export default function FuncionalidadForm({
  mode = "create",
  initialData,
  onSave,
  onCancel,
}: FuncionalidadFormProps) {
  // Estados del formulario
  const [formData, setFormData] = useState({
    aplicacion: initialData?.aplicacion || "1", // Usar aplicación de datos iniciales o Security Suite por defecto
    nombre: initialData?.nombre || "",
    estado: (initialData?.estado || "A") as EstadoCode,
    esPublico: initialData?.esPublico || false,
    soloRoot: initialData?.soloRoot || false,
  });

  // Estados para API y carga de datos
  const [apps, setApps] = useState<AplicacionDB[]>([]);
  const [objetos, setObjetos] = useState<Objeto[]>([]);
  const [loadingObjetos, setLoadingObjetos] = useState(false);

  // Cargar aplicaciones al montar
  useEffect(() => {
    apiAplicacionesDB({ estado: "A", pageSize: 999 })
      .then((res) => setApps(res.items))
      .catch(console.error);
  }, []);

  // Estados para drag and drop
  const [selectedItems, setSelectedItems] = useState<
    (Objeto | SortableAction)[]
  >([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Estados para colapsar/expandir objetos
  const [collapsedObjects, setCollapsedObjects] = useState<Set<string>>(
    new Set(),
  );
  const [collapsedSelectedObjects, setCollapsedSelectedObjects] = useState<
    Set<string>
  >(new Set());

  // Estados para filtros de búsqueda
  const [searchAvailable, setSearchAvailable] = useState("");
  const [searchSelected, setSearchSelected] = useState("");

  // Función para cargar objetos desde la DB local
  const loadObjetos = async (aplicacionId: string) => {
    try {
      setLoadingObjetos(true);
      const response = await apiObjetosDB({
        aplicacionId: parseInt(aplicacionId),
        estado: "A",
        pageSize: 999,
      });

      const objetosFromDb: Objeto[] = (response.items ?? []).map((item: any) => ({
        id: `obj-${item.id}`,
        nombre: item.label || item.key,
        codigo: item.key,
        ruta: item.path || `/${item.key}`,
        acciones: (item.acciones ?? []).map((a: any) => ({
          id: `act-${a.id}`,
          nombre: a.label || a.key,
          codigo: a.codigo || a.key,
          descripcion: a.descripcion || "",
          ruta: a.path || "",
        })),
      }));

      setObjetos(objetosFromDb);
      setCollapsedObjects(new Set(objetosFromDb.map((obj) => obj.id)));
    } catch (error) {
      console.error("Error loading objetos:", error);
      setObjetos([]);
    } finally {
      setLoadingObjetos(false);
    }
  };

  // Efecto para cargar objetos cuando cambie la aplicación
  useEffect(() => {
    loadObjetos(formData.aplicacion);
  }, [formData.aplicacion]);

  // Efecto para pre-seleccionar elementos en modo edición
  useEffect(() => {
    if (mode === "edit" && initialData?.acciones && objetos.length > 0) {
      const elementosASeleccionar: (Objeto | SortableAction)[] = [];

      // Agrupar acciones por objeto
      const accionesPorObjeto = new Map<number, number[]>();
      initialData.acciones.forEach((accion) => {
        const objetoId = accion.ObjetoId;
        if (!accionesPorObjeto.has(objetoId)) {
          accionesPorObjeto.set(objetoId, []);
        }
        accionesPorObjeto.get(objetoId)!.push(accion.AccionId);
      });

      // Para cada objeto, verificar si seleccionar el objeto completo o acciones individuales
      accionesPorObjeto.forEach((accionIds, objetoId) => {
        const objeto = objetos.find(
          (obj) => parseInt(obj.id.replace("obj-", "")) === objetoId,
        );
        if (!objeto) return;

        // Si todas las acciones del objeto están seleccionadas, seleccionar el objeto completo
        const todasLasAccionesSeleccionadas = objeto.acciones.every((accion) =>
          accionIds.includes(parseInt(accion.id.replace("act-", ""))),
        );

        if (todasLasAccionesSeleccionadas) {
          elementosASeleccionar.push(objeto);
        } else {
          // Seleccionar acciones individuales
          objeto.acciones.forEach((accion) => {
            const accionId = parseInt(accion.id.replace("act-", ""));
            if (accionIds.includes(accionId)) {
              elementosASeleccionar.push(accion);
            }
          });
        }
      });

      setSelectedItems(elementosASeleccionar);
    }
  }, [mode, initialData?.acciones, objetos]);

  // Sensores para el drag and drop
  const sensors = useSensors(useSensor(PointerSensor));

  // Estados para el guardado
  const [saving, setSaving] = useState(false);

  // Handlers
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setSaving(true);

      // Derivar objetoKey / accionKey del primer item seleccionado
      let objetoKey: string | undefined;
      let accionKey: string | undefined;
      if (selectedItems.length > 0) {
        const first = selectedItems[0];
        if ("acciones" in first) {
          // Es un Objeto completo
          objetoKey = (first as Objeto).codigo;
        } else {
          // Es una acción individual — buscar su objeto padre
          const padre = objetos.find((obj) =>
            obj.acciones.some((acc) => acc.id === (first as SortableAction).id),
          );
          if (padre) objetoKey = padre.codigo;
          accionKey = (first as SortableAction).codigo;
        }
      }

      const base = {
        nombre: formData.nombre,
        estado: formData.estado,
        esPublico: formData.esPublico ? "S" : "N",
        soloRoot: formData.soloRoot ? "S" : "N",
        ...(objetoKey ? { objetoKey } : {}),
        ...(accionKey ? { accionKey } : {}),
      };

      let result;
      if (mode === "edit" && initialData?.id) {
        result = await apiActualizarFuncionalidadDB(parseInt(initialData.id), base);
      } else {
        result = await apiCrearFuncionalidadDB({
          aplicacionId: parseInt(formData.aplicacion),
          ...base,
        });
      }

      if (result.success) {
        if (onSave) {
          onSave({
            ...formData,
            selectedItems,
            id: result.funcionalidad?.id || initialData?.id,
          });
        }
      } else {
        throw new Error(result.error || "Error al guardar la funcionalidad");
      }
    } catch (error) {
      console.error("Error guardando funcionalidad:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && over.id === "selected-items") {
      const draggedItem = findItemById(active.id as string);
      if (draggedItem) {
        // Si es un objeto, agregar el objeto y todas sus acciones
        if ("acciones" in draggedItem) {
          const objeto = draggedItem as Objeto;
          const newItems = [objeto, ...objeto.acciones].filter(
            (item) =>
              !selectedItems.find((existing) => existing.id === item.id),
          );
          setSelectedItems((prev) => [...prev, ...newItems]);
        } else {
          // Si es una acción, agregar la acción y su objeto padre (si no está ya)
          const accion = draggedItem as SortableAction;

          // Buscar el objeto padre de esta acción
          const objetoPadre = objetos.find((obj) =>
            obj.acciones.some((acc) => acc.id === accion.id),
          );

          if (objetoPadre) {
            const itemsToAdd: (Objeto | SortableAction)[] = [];

            // Agregar el objeto padre si no está ya seleccionado
            if (!selectedItems.find((item) => item.id === objetoPadre.id)) {
              itemsToAdd.push(objetoPadre);
            }

            // Agregar la acción si no está ya seleccionada
            if (!selectedItems.find((item) => item.id === accion.id)) {
              itemsToAdd.push(accion);
            }

            setSelectedItems((prev) => [...prev, ...itemsToAdd]);
          }
        }
      }
    }

    setActiveId(null);
  };

  // Handlers para colapsar/expandir
  const toggleObjectCollapse = (objectId: string, isSelected = false) => {
    const setterFunction = isSelected
      ? setCollapsedSelectedObjects
      : setCollapsedObjects;
    setterFunction((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(objectId)) {
        newSet.delete(objectId);
      } else {
        newSet.add(objectId);
      }
      return newSet;
    });
  };

  // Funciones de filtrado
  const filteredAvailableObjetos = objetos.filter((objeto) =>
    objeto.nombre.toLowerCase().includes(searchAvailable.toLowerCase()),
  );

  const filteredSelectedItems = () => {
    if (!searchSelected) return getSelectedObjectsGrouped();

    const filtered = new Map<
      string,
      { objeto: Objeto | null; acciones: SortableAction[] }
    >();
    const grouped = getSelectedObjectsGrouped();

    for (const [key, group] of grouped) {
      if (
        group.objeto &&
        group.objeto.nombre.toLowerCase().includes(searchSelected.toLowerCase())
      ) {
        filtered.set(key, group);
      }
    }

    return filtered;
  };

  const findItemById = (id: string): Objeto | SortableAction | null => {
    // Buscar en objetos
    for (const objeto of objetos) {
      if (objeto.id === id) return objeto;
      // Buscar en acciones del objeto
      for (const accion of objeto.acciones) {
        if (accion.id === id) return accion;
      }
    }
    return null;
  };

  const removeFromSelected = (id: string) => {
    setSelectedItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Obtener objetos seleccionados (agrupar por objeto padre)
  const getSelectedObjectsGrouped = () => {
    const objectsMap = new Map<
      string,
      { objeto: Objeto | null; acciones: SortableAction[] }
    >();

    selectedItems.forEach((item) => {
      if ("acciones" in item) {
        // Es un objeto
        const objeto = item as Objeto;
        objectsMap.set(objeto.id, {
          objeto,
          acciones: objectsMap.get(objeto.id)?.acciones || [],
        });
      } else {
        // Es una acción, encontrar su objeto padre
        const parentObject = objetos.find((obj) =>
          obj.acciones.some((acc) => acc.id === item.id),
        );
        if (parentObject) {
          const existing = objectsMap.get(parentObject.id) || {
            objeto: null,
            acciones: [],
          };
          objectsMap.set(parentObject.id, {
            ...existing,
            acciones: [...existing.acciones, item as SortableAction],
          });
        }
      }
    });

    return Array.from(objectsMap.entries());
  };

  // Componente para items draggables
  const SortableItem = ({
    id,
    children,
  }: {
    id: string;
    children: React.ReactNode;
  }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        {children}
      </div>
    );
  };

  // Componente Droppable para la zona de destino
  const DroppableArea = ({
    id,
    children,
  }: {
    id: string;
    children: React.ReactNode;
  }) => {
    const { isOver, setNodeRef } = useDroppable({
      id,
    });

    const style = {
      backgroundColor: isOver ? "rgba(59, 130, 246, 0.1)" : undefined,
      borderColor: isOver ? "#3b82f6" : undefined,
    };

    return (
      <div ref={setNodeRef} style={style} className="transition-colors">
        {children}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {mode === "create" ? "Crear" : "Editar"} Funcionalidad
            </h1>
            <p className="text-muted-foreground">
              Complete los datos para la funcionalidad
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="border-b border-border" />

        {/* Form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Información Básica</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Fila 1: Aplicación y Nombre */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-3 space-y-1.5">
                  <Label htmlFor="aplicacion">Aplicación</Label>
                  <Select
                    value={formData.aplicacion}
                    onValueChange={(value) =>
                      handleFieldChange("aplicacion", value)
                    }
                  >
                    <SelectTrigger id="aplicacion" className="h-9">
                      <SelectValue placeholder="Seleccionar aplicación" />
                    </SelectTrigger>
                    <SelectContent>
                      {apps.map((app) => (
                        <SelectItem key={String(app.id)} value={String(app.id)}>
                          {app.id} - {app.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-9 space-y-1.5">
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input
                    id="nombre"
                    className="h-9"
                    value={formData.nombre}
                    onChange={(e) =>
                      handleFieldChange("nombre", e.target.value)
                    }
                    placeholder="Nombre de la funcionalidad"
                    required
                  />
                </div>
              </div>

              {/* Fila 2: Estado y Switches */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-2 space-y-1.5">
                  <Label>Estado</Label>
                  <Select
                    value={formData.estado}
                    onValueChange={(value) =>
                      handleFieldChange("estado", value)
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
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

                <div className="md:col-span-1"></div>

                <div className="md:col-span-9 flex items-center gap-4 h-9">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="esPublico"
                      checked={formData.esPublico}
                      onCheckedChange={(checked) =>
                        handleFieldChange("esPublico", checked)
                      }
                    />
                    <Label htmlFor="esPublico">Es Público</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="soloRoot"
                      checked={formData.soloRoot}
                      onCheckedChange={(checked) =>
                        handleFieldChange("soloRoot", checked)
                      }
                    />
                    <Label htmlFor="soloRoot">Solo Root</Label>
                  </div>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Sección de Objetos y Acciones con Drag and Drop */}
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {/* Tabla izquierda - Objetos disponibles */}
            <Card className="shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="h-2 w-2 bg-blue-500 rounded-full" />
                    Objetos Disponibles
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {searchAvailable
                      ? `${filteredAvailableObjetos.length} de ${objetos.length}`
                      : `${filteredAvailableObjetos.length} objetos`}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Arrastra elementos hacia la columna de la derecha
                </p>
                <div className="mt-3">
                  <div className="relative">
                    <Search className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Buscar objetos..."
                      value={searchAvailable}
                      onChange={(e) => setSearchAvailable(e.target.value)}
                      className="h-8 pl-8 pr-8 text-sm"
                    />
                    {searchAvailable && (
                      <button
                        onClick={() => setSearchAvailable("")}
                        className="absolute right-2 top-2 h-4 w-4 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {loadingObjetos ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                      <span>Cargando objetos...</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                    {filteredAvailableObjetos.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Search className="h-12 w-12 text-gray-300 mb-3" />
                        <p className="text-gray-500 font-medium">
                          {searchAvailable
                            ? "No se encontraron objetos"
                            : "No hay objetos disponibles"}
                        </p>
                        <p className="text-sm text-gray-400">
                          {searchAvailable
                            ? `Buscando: "${searchAvailable}"`
                            : "Selecciona una aplicación diferente"}
                        </p>
                      </div>
                    ) : (
                      <SortableContext
                        items={filteredAvailableObjetos.map((obj) => obj.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {filteredAvailableObjetos.map((objeto) => {
                          const isCollapsed = collapsedObjects.has(objeto.id);
                          return (
                            <div key={objeto.id} className="space-y-1.5">
                              {/* Objeto Principal con botón de colapso */}
                              <div className="relative">
                                <SortableItem id={objeto.id}>
                                  <div className="group flex items-center gap-2.5 p-3 bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-blue-500 rounded-lg hover:shadow-md transition-all duration-200 cursor-grab active:cursor-grabbing hover:from-blue-100 hover:to-blue-200">
                                    <GripVertical className="h-4 w-4 text-blue-400 group-hover:text-blue-600 transition-colors flex-shrink-0" />
                                    <div className="flex-1 min-w-0 pr-12">
                                      <div className="font-medium text-gray-900 truncate text-sm">
                                        {objeto.nombre}
                                      </div>
                                      <div className="text-xs text-blue-600 font-mono">
                                        {objeto.codigo}
                                      </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 flex-shrink-0 mr-8">
                                      <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-2 py-0.5">
                                        Objeto
                                      </Badge>
                                      <span className="text-xs text-blue-500 font-medium">
                                        {objeto.acciones.length} acciones
                                      </span>
                                    </div>
                                  </div>
                                </SortableItem>

                                {/* Botón de colapso/expand */}
                                <button
                                  onClick={() =>
                                    toggleObjectCollapse(objeto.id)
                                  }
                                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 rounded-full bg-white shadow-sm border hover:bg-gray-50 transition-colors z-10"
                                  type="button"
                                >
                                  {isCollapsed ? (
                                    <ChevronRight className="h-3.5 w-3.5 text-blue-600" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5 text-blue-600" />
                                  )}
                                </button>
                              </div>

                              {/* Acciones del objeto (colapsables) */}
                              {!isCollapsed && (
                                <div className="ml-6 space-y-1.5 relative animate-in slide-in-from-top-2 duration-200">
                                  <div className="absolute left-[-12px] top-0 bottom-0 w-px bg-gray-200" />
                                  <SortableContext
                                    items={objeto.acciones.map((acc) => acc.id)}
                                    strategy={verticalListSortingStrategy}
                                  >
                                    {objeto.acciones.map((accion) => (
                                      <SortableItem
                                        key={accion.id}
                                        id={accion.id}
                                      >
                                        <div className="group relative flex items-center gap-2.5 p-2.5 bg-gradient-to-r from-green-50 to-green-100 border-l-2 border-green-400 rounded-md hover:shadow-sm transition-all duration-200 cursor-grab active:cursor-grabbing hover:from-green-100 hover:to-green-200">
                                          <div className="absolute left-[-14px] top-1/2 w-2.5 h-px bg-gray-200" />
                                          <GripVertical className="h-3.5 w-3.5 text-green-400 group-hover:text-green-600 transition-colors flex-shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium text-gray-800 text-sm truncate">
                                              {accion.nombre}
                                            </div>
                                            {accion.descripcion && (
                                              <div className="text-xs text-gray-600 truncate">
                                                {accion.descripcion}
                                              </div>
                                            )}
                                            <div className="text-xs text-green-600 font-mono">
                                              {accion.codigo}
                                            </div>
                                          </div>
                                          <Badge
                                            variant="outline"
                                            className="bg-green-100 text-green-700 border-green-300 text-xs px-1.5 py-0.5 flex-shrink-0"
                                          >
                                            Acción
                                          </Badge>
                                        </div>
                                      </SortableItem>
                                    ))}
                                  </SortableContext>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </SortableContext>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tabla derecha - Items seleccionados */}
            <Card className="shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="h-2 w-2 bg-emerald-500 rounded-full" />
                    Elementos Seleccionados
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {selectedItems.length} elementos
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Elementos asignados a esta funcionalidad
                </p>
                <div className="mt-3">
                  <div className="relative">
                    <Search className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Buscar elementos seleccionados..."
                      value={searchSelected}
                      onChange={(e) => setSearchSelected(e.target.value)}
                      className="h-8 pl-8 pr-8 text-sm"
                    />
                    {searchSelected && (
                      <button
                        onClick={() => setSearchSelected("")}
                        className="absolute right-2 top-2 h-4 w-4 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <DroppableArea id="selected-items">
                  <div className="min-h-[500px] max-h-[500px] overflow-y-auto p-6 border-2 border-dashed border-gray-300 rounded-lg bg-gradient-to-br from-gray-50 to-white transition-all duration-300">
                    {selectedItems.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <div className="relative mb-4">
                          <div className="w-16 h-16 border-4 border-dashed border-gray-300 rounded-full flex items-center justify-center">
                            <Plus className="h-8 w-8" />
                          </div>
                          <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                            <GripVertical className="h-3 w-3 text-white" />
                          </div>
                        </div>
                        <p className="text-lg font-medium mb-2">
                          Arrastra elementos aquí
                        </p>
                        <p className="text-sm text-center max-w-48">
                          Arrastra un <strong>objeto</strong> y se incluirán
                          todas sus acciones
                        </p>
                      </div>
                    ) : Array.from(filteredSelectedItems()).length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <Search className="h-12 w-12 text-gray-300 mb-3" />
                        <p className="text-lg font-medium mb-2">
                          No se encontraron elementos
                        </p>
                        <p className="text-sm text-center">
                          Buscando:{" "}
                          <strong>&quot;{searchSelected}&quot;</strong>
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {Array.from(filteredSelectedItems()).map(
                          ([objectId, { objeto, acciones }]) => {
                            const isCollapsed =
                              collapsedSelectedObjects.has(objectId);
                            const hasObject = objeto !== null;

                            return (
                              <div
                                key={objectId}
                                className="bg-white border border-gray-200 rounded-lg shadow-sm"
                              >
                                {/* Header del objeto */}
                                {hasObject && (
                                  <div
                                    className="group flex items-center gap-2.5 p-3 bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-blue-500 rounded-t-lg cursor-pointer hover:from-blue-100 hover:to-blue-200 transition-all duration-200"
                                    onClick={() =>
                                      toggleObjectCollapse(objectId, true)
                                    }
                                  >
                                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                                    <div className="flex-1 min-w-0 pr-16">
                                      <div className="font-medium text-gray-900 truncate text-sm">
                                        {objeto.nombre}
                                      </div>
                                      <div className="text-xs text-blue-600 font-mono">
                                        {objeto.codigo}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <Badge className="bg-blue-500 text-white text-xs px-2 py-0.5">
                                        Objeto
                                      </Badge>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600 h-7 w-7 p-0"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeFromSelected(objeto.id);
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {/* Acciones del objeto */}
                                {acciones.length > 0 && !isCollapsed && (
                                  <div className="p-2.5 space-y-1.5 border-t border-gray-100">
                                    {acciones.map((accion) => (
                                      <div
                                        key={accion.id}
                                        className="group flex items-center gap-2.5 p-2.5 bg-gradient-to-r from-green-50 to-green-100 border-l-2 border-green-400 rounded-md"
                                      >
                                        <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-gray-800 text-sm truncate">
                                            {accion.nombre}
                                          </div>
                                          {accion.descripcion && (
                                            <div className="text-xs text-gray-600 truncate">
                                              {accion.descripcion}
                                            </div>
                                          )}
                                          <div className="text-xs text-green-600 font-mono">
                                            {accion.codigo}
                                          </div>
                                        </div>
                                        <Badge
                                          variant="outline"
                                          className="bg-green-100 text-green-700 border-green-300 text-xs px-1.5 py-0.5 flex-shrink-0"
                                        >
                                          Acción
                                        </Badge>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600 h-6 w-6 p-0"
                                          onClick={() =>
                                            removeFromSelected(accion.id)
                                          }
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          },
                        )}

                        {/* Botón para limpiar todos */}
                        {selectedItems.length > 1 && (
                          <div className="pt-4 border-t border-gray-200">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                              onClick={() => setSelectedItems([])}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Limpiar todo ({selectedItems.length})
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </DroppableArea>
              </CardContent>
            </Card>
          </div>

          {/* Overlay mejorado para el elemento que se está arrastrando */}
          <DragOverlay>
            {activeId ? (
              <div className="flex items-center gap-3 p-4 bg-white border-2 border-blue-500 rounded-lg shadow-xl transform rotate-2">
                <GripVertical className="h-5 w-5 text-blue-500" />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">
                    {findItemById(activeId)?.nombre}
                  </div>
                  <div className="text-sm text-gray-500 font-mono">
                    {findItemById(activeId)?.codigo}
                  </div>
                </div>
                <Badge className="bg-blue-500 text-white">Arrastrando...</Badge>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
