"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, X, Search, Shield } from "lucide-react";
import { toast } from "sonner";
import {
  apiObtenerAccesosUsuarioDB,
  apiActualizarAccesosUsuarioDB,
  FuncionalidadConEstadoDB,
  CambioAccesoDB,
} from "@/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type OverrideLocal = "none" | "grant" | "deny";

interface FuncLocalState {
  funcionalidadId: number;
  funcionalidadNombre: string;
  aplicacionId: number;
  aplicacionNombre: string;
  viaRoles: string[];
  accesoDirectoOriginal: FuncionalidadConEstadoDB["accesoDirecto"];
  overrideSeleccionado: OverrideLocal;
  fechaDesde: string;
  fechaHasta: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AsignarFuncionalidadesModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: number;
  userName: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function origenLabel(f: FuncLocalState): string {
  const { accesoDirectoOriginal, viaRoles } = f;
  if (accesoDirectoOriginal?.efecto === "grant") return "Asignada directa: grant";
  if (accesoDirectoOriginal?.efecto === "deny") return "Bloqueada directa: deny";
  if (viaRoles.length > 0) return `Heredada de rol: ${viaRoles.join(", ")}`;
  return "Sin acceso";
}

function origenVariant(
  f: FuncLocalState
): "default" | "destructive" | "secondary" | "outline" {
  if (f.accesoDirectoOriginal?.efecto === "grant") return "default";
  if (f.accesoDirectoOriginal?.efecto === "deny") return "destructive";
  if (f.viaRoles.length > 0) return "secondary";
  return "outline";
}

function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function buildCambios(estados: FuncLocalState[]): CambioAccesoDB[] {
  const cambios: CambioAccesoDB[] = [];

  for (const f of estados) {
    const original = f.accesoDirectoOriginal;
    const seleccionado = f.overrideSeleccionado;
    const hayCambio =
      seleccionado === "none"
        ? original !== null // quitar override
        : original?.efecto !== seleccionado ||
          isoToDateInput(original?.fechaDesde) !== f.fechaDesde ||
          isoToDateInput(original?.fechaHasta) !== f.fechaHasta;

    if (!hayCambio) continue;

    if (seleccionado === "none") {
      cambios.push({ funcionalidadId: f.funcionalidadId, remove: true });
    } else {
      cambios.push({
        funcionalidadId: f.funcionalidadId,
        efecto: seleccionado,
        fechaDesde: f.fechaDesde || null,
        fechaHasta: f.fechaHasta || null,
      });
    }
  }

  return cambios;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AsignarFuncionalidadesModal({
  isOpen,
  onClose,
  userId,
  userName,
}: AsignarFuncionalidadesModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [estados, setEstados] = useState<FuncLocalState[]>([]);

  // ── Load ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      loadFuncionalidades();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const loadFuncionalidades = async () => {
    try {
      setLoading(true);
      const response = await apiObtenerAccesosUsuarioDB(userId);
      if (!response.success) {
        toast.error("Error al cargar funcionalidades");
        return;
      }

      const mapped: FuncLocalState[] = response.items.map((item) => ({
        funcionalidadId: item.funcionalidadId,
        funcionalidadNombre: item.funcionalidadNombre,
        aplicacionId: item.aplicacionId,
        aplicacionNombre: item.aplicacionNombre,
        viaRoles: item.viaRoles,
        accesoDirectoOriginal: item.accesoDirecto,
        overrideSeleccionado: item.accesoDirecto
          ? (item.accesoDirecto.efecto as OverrideLocal)
          : "none",
        fechaDesde: isoToDateInput(item.accesoDirecto?.fechaDesde),
        fechaHasta: isoToDateInput(item.accesoDirecto?.fechaHasta),
      }));

      setEstados(mapped);
    } catch (error) {
      console.error("[AsignarFuncionalidadesModal] Error:", error);
      toast.error("Error al cargar funcionalidades del usuario");
    } finally {
      setLoading(false);
    }
  };

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleOverrideChange = (funcId: number, value: OverrideLocal) => {
    setEstados((prev) =>
      prev.map((f) =>
        f.funcionalidadId === funcId
          ? { ...f, overrideSeleccionado: value }
          : f
      )
    );
  };

  const handleFechaChange = (
    funcId: number,
    campo: "fechaDesde" | "fechaHasta",
    value: string
  ) => {
    setEstados((prev) =>
      prev.map((f) =>
        f.funcionalidadId === funcId ? { ...f, [campo]: value } : f
      )
    );
  };

  const handleSave = async () => {
    const cambios = buildCambios(estados);

    if (cambios.length === 0) {
      toast.info("No hay cambios para guardar");
      return;
    }

    try {
      setSaving(true);
      const response = await apiActualizarAccesosUsuarioDB(userId, cambios);

      if (response?.success !== false) {
        toast.success(`${cambios.length} cambio(s) guardado(s) correctamente`);
        onClose();
      } else {
        toast.error(response?.error || "Error al guardar cambios");
      }
    } catch (error) {
      console.error("[AsignarFuncionalidadesModal] Error guardando:", error);
      toast.error("Error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSearchTerm("");
    setEstados([]);
    onClose();
  };

  // ── Filtrado y agrupación ─────────────────────────────────────────────────

  const filtrados = useMemo(() => {
    if (!searchTerm.trim()) return estados;
    const term = searchTerm.toLowerCase();
    return estados.filter(
      (f) =>
        f.funcionalidadNombre.toLowerCase().includes(term) ||
        f.aplicacionNombre.toLowerCase().includes(term)
    );
  }, [estados, searchTerm]);

  // Agrupar por aplicación
  const porAplicacion = useMemo(() => {
    const grupos = new Map<string, FuncLocalState[]>();
    for (const f of filtrados) {
      const key = `${f.aplicacionId}:${f.aplicacionNombre}`;
      const grupo = grupos.get(key) ?? [];
      grupo.push(f);
      grupos.set(key, grupo);
    }
    return grupos;
  }, [filtrados]);

  const totalCambios = buildCambios(estados).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col"
        data-no-loading="true"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Asignar Funcionalidades - {userName}
          </DialogTitle>
          <DialogDescription>
            Gestioná los accesos directos del usuario, independientes de sus roles.
            &quot;Sin override&quot; significa que rige lo que digan los roles asignados.
          </DialogDescription>
        </DialogHeader>

        {/* Buscador */}
        <div className="space-y-2 shrink-0">
          <Label htmlFor="search-func">Buscar funcionalidad</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="search-func"
              placeholder="Filtrar por nombre o aplicación..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-auto border rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Cargando funcionalidades...</p>
              </div>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              {searchTerm
                ? "No se encontraron funcionalidades con ese criterio"
                : "No hay funcionalidades disponibles"}
            </div>
          ) : (
            <div>
              {Array.from(porAplicacion.entries()).map(([appKey, funcs]) => {
                const appNombre = appKey.split(":").slice(1).join(":");
                return (
                  <div key={appKey}>
                    {/* Encabezado de grupo */}
                    <div className="sticky top-0 bg-muted/80 backdrop-blur-sm px-4 py-2 border-b">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {appNombre}
                      </span>
                    </div>

                    {/* Filas de funcionalidad */}
                    <div className="divide-y">
                      {funcs.map((f) => (
                        <div
                          key={f.funcionalidadId}
                          className="p-4 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                            {/* Info izquierda */}
                            <div className="flex-1 space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-sm">
                                  {f.funcionalidadNombre}
                                </span>
                                <Badge variant={origenVariant(f)} className="text-xs">
                                  {origenLabel(f)}
                                </Badge>
                              </div>
                            </div>

                            {/* Controles derecha */}
                            <div className="flex flex-col gap-2 sm:items-end sm:min-w-[280px]">
                              {/* Selector de override */}
                              <Select
                                value={f.overrideSeleccionado}
                                onValueChange={(val) =>
                                  handleOverrideChange(
                                    f.funcionalidadId,
                                    val as OverrideLocal
                                  )
                                }
                              >
                                <SelectTrigger className="w-full sm:w-48 h-8 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Sin override (rige rol)</SelectItem>
                                  <SelectItem value="grant">Permitir (grant)</SelectItem>
                                  <SelectItem value="deny">Denegar (deny)</SelectItem>
                                </SelectContent>
                              </Select>

                              {/* Date pickers — solo si hay override */}
                              {f.overrideSeleccionado !== "none" && (
                                <div className="flex gap-2 w-full sm:w-48">
                                  <div className="flex-1 space-y-1">
                                    <Label className="text-xs text-muted-foreground">Desde</Label>
                                    <Input
                                      type="date"
                                      value={f.fechaDesde}
                                      onChange={(e) =>
                                        handleFechaChange(
                                          f.funcionalidadId,
                                          "fechaDesde",
                                          e.target.value
                                        )
                                      }
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                  <div className="flex-1 space-y-1">
                                    <Label className="text-xs text-muted-foreground">Hasta</Label>
                                    <Input
                                      type="date"
                                      value={f.fechaHasta}
                                      onChange={(e) =>
                                        handleFechaChange(
                                          f.funcionalidadId,
                                          "fechaHasta",
                                          e.target.value
                                        )
                                      }
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            <Save className="w-4 h-4 mr-2" />
            {saving
              ? "Guardando..."
              : totalCambios > 0
                ? `Guardar ${totalCambios} cambio(s)`
                : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
