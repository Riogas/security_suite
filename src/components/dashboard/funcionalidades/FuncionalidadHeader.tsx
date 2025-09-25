"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Eye, EyeOff, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

const APP_OPTIONS = [
  { value: "1", label: "1 - Security Suite" },
  { value: "2", label: "2 - Gestión de Sistemas" },
  { value: "3", label: "3 - GOYA" },
  { value: "4", label: "4 - SGM" },
] as const;

export type EstadoCode = "A" | "I";
export type DateRange = { from?: Date; to?: Date };

interface FuncionalidadHeaderProps {
  mode: "create" | "edit";
  showDetails: boolean;
  onToggleDetails: () => void;
}

interface FuncionalidadConfigProps {
  selectedApp: string;
  onAppChange: (value: string) => void;
  isLoadingObjects: boolean;
  nombre: string;
  onNombreChange: (value: string) => void;
  estado: EstadoCode;
  onEstadoChange: (value: EstadoCode) => void;
  esPublico: boolean;
  onEsPublicoChange: (value: boolean) => void;
  soloRoot: boolean;
  onSoloRootChange: (value: boolean) => void;
  rango: DateRange;
  onRangoChange: (value: DateRange) => void;
  showDetails: boolean;
  objectsCount: number;
  selectedObjectsCount: number;
  totalActionsCount: number;
}

export function FuncionalidadHeader({ mode, showDetails, onToggleDetails }: FuncionalidadHeaderProps) {
  return (
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
          onClick={onToggleDetails}
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
  );
}

export function FuncionalidadConfig({
  selectedApp,
  onAppChange,
  isLoadingObjects,
  nombre,
  onNombreChange,
  estado,
  onEstadoChange,
  esPublico,
  onEsPublicoChange,
  soloRoot,
  onSoloRootChange,
  rango,
  onRangoChange,
  showDetails,
  objectsCount,
  selectedObjectsCount,
  totalActionsCount,
}: FuncionalidadConfigProps) {
  const [mostrarCalendario, setMostrarCalendario] = useState(false);

  return (
    <Card className="border-2">
      <CardHeader className="border-b bg-muted/30 pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings className="w-4 h-4" />
          Información Básica
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Fila 1: Aplicación y Nombre */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-3 space-y-1.5">
              <Label htmlFor="aplicacion" className="text-sm font-medium">
                Aplicación *
              </Label>
              <Select value={selectedApp} onValueChange={onAppChange}>
                <SelectTrigger id="aplicacion" className="h-9">
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

            <div className="md:col-span-9 space-y-1.5">
              <Label htmlFor="nombre" className="text-sm font-medium">
                Nombre *
              </Label>
              <Input 
                id="nombre" 
                value={nombre} 
                onChange={(e) => onNombreChange(e.target.value)} 
                placeholder="Nombre de la funcionalidad"
                className="h-9"
              />
            </div>
          </div>

          {/* Fila 2: Estado, Switches y Vigencia */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="estado" className="text-sm font-medium">Estado</Label>
              <Select value={estado} onValueChange={(v: EstadoCode) => onEstadoChange(v)}>
                <SelectTrigger id="estado" className="h-9">
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

            <div className="md:col-span-2.5 flex items-center gap-2 h-9">
              <Switch 
                id="publico" 
                checked={esPublico} 
                onCheckedChange={onEsPublicoChange}
                className="data-[state=checked]:bg-blue-600"
              />
              <Label htmlFor="publico" className="text-sm cursor-pointer whitespace-nowrap">
                Es Público
              </Label>
            </div>

            <div className="md:col-span-2.5 flex items-center gap-2 h-9">
              <Switch 
                id="soloRoot" 
                checked={soloRoot} 
                onCheckedChange={onSoloRootChange}
                className="data-[state=checked]:bg-orange-600"
              />
              <Label htmlFor="soloRoot" className="text-sm cursor-pointer whitespace-nowrap">
                Solo Root
              </Label>
            </div>

            <div className="md:col-span-5 space-y-1.5">
              <Label className="text-sm font-medium">Vigencia</Label>
              <div className="relative">
                <Input
                  readOnly
                  value={rango.from && rango.to ? `${format(rango.from, "dd/MM/yyyy")} — ${format(rango.to, "dd/MM/yyyy")}` : "Sin restricción de fechas"}
                  onClick={() => setMostrarCalendario((v: boolean) => !v)}
                  className="h-9 cursor-pointer"
                  placeholder="Seleccionar rango de fechas"
                />
                {mostrarCalendario && (
                  <div className="absolute z-50 mt-2 rounded-md border bg-popover p-2 shadow-lg">
                    <DayPicker
                      mode="range"
                      selected={rango as any}
                      onSelect={(r: any) => onRangoChange(r || {})}
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
                      <Button size="sm" variant="outline" onClick={() => { onRangoChange({}); setMostrarCalendario(false); }}>Limpiar</Button>
                      <Button size="sm" onClick={() => setMostrarCalendario(false)}>OK</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Información adicional cuando showDetails está activado */}
          {showDetails && (
            <div className="border-t pt-3 mt-1">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Objetos disponibles:</span>
                  <Badge variant="secondary" className="text-xs">
                    {objectsCount}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Objetos seleccionados:</span>
                  <Badge variant="secondary" className="text-xs">
                    {selectedObjectsCount}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Acciones totales:</span>
                  <Badge variant="secondary" className="text-xs">
                    {totalActionsCount}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}