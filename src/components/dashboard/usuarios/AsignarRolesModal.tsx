"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Search, Save, X, Users } from "lucide-react";
import { toast } from "sonner";
import {
  apiRolesDB,
  apiRolesUsuarioDB,
  apiAsignarRolesDB,
  RolDB,
} from "@/services/api";
import { DateRange } from "react-day-picker";

interface Rol {
  RolId: number;
  RolNombre: string;
  RolDescripcion: string;
  RolEstado: string;
  AplicacionId: string;
  AplicacionNombre: string;
  RolNivel?: string | number;
  RolFchIns?: string;
  RolCreadoEn?: string;
  esRoot?: string;
  asignado?: boolean;
}

interface UsuarioRolDB {
  usuarioId: number;
  rolId: number;
  fechaDesde: string | null;
  fechaHasta: string | null;
  rol?: RolDB;
}

interface RolesUsuarioDBResponse {
  success: boolean;
  roles?: UsuarioRolDB[];
}

interface AsignarRolesModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: number;
  userName: string;
}

export default function AsignarRolesModal({
  isOpen,
  onClose,
  userId,
  userName,
}: AsignarRolesModalProps) {
  const [roles, setRoles] = useState<Rol[]>([]);
  const [filteredRoles, setFilteredRoles] = useState<Rol[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [aplicacionFiltro, setAplicacionFiltro] = useState("todos");
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const [roleDateRanges, setRoleDateRanges] = useState<
    Record<number, DateRange | undefined>
  >({});

  useEffect(() => {
    if (isOpen) {
      loadRoles();
    }
  }, [isOpen]);

  // Aplicaciones únicas derivadas de los roles cargados (para el filtro)
  const aplicaciones = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of roles) {
      if (r.AplicacionId) map.set(r.AplicacionId, r.AplicacionNombre || `#${r.AplicacionId}`);
    }
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [roles]);

  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = roles.filter((rol) => {
      if (aplicacionFiltro !== "todos" && rol.AplicacionId !== aplicacionFiltro)
        return false;
      if (!term) return true;
      return (
        rol.RolNombre.toLowerCase().includes(term) ||
        rol.RolDescripcion.toLowerCase().includes(term) ||
        rol.AplicacionNombre.toLowerCase().includes(term)
      );
    });
    setFilteredRoles(filtered);
  }, [searchTerm, aplicacionFiltro, roles]);

  const loadRoles = async () => {
    try {
      setLoadingRoles(true);
      console.log("[AsignarRolesModal] Cargando roles para usuario:", userId);

      const rolesResponse = await apiRolesDB({
        estado: "A",
        pageSize: 1000,
      });

      const rolesItems = rolesResponse?.items ?? [];

      if (rolesItems.length === 0) {
        setRoles([]);
        setFilteredRoles([]);
        return;
      }

      let rolesAsignadosIds = new Set<number>();
      try {
        const rolesAsignadosResponse: RolesUsuarioDBResponse =
          await apiRolesUsuarioDB(userId);
        rolesAsignadosIds = new Set<number>(
          (rolesAsignadosResponse?.roles ?? []).map((ur) => ur.rolId),
        );
      } catch (error) {
        console.warn(
          "[AsignarRolesModal] Error obteniendo roles asignados:",
          error,
        );
      }

      const rolesConAsignacion: Rol[] = rolesItems.map((r: RolDB) => ({
        RolId: r.id,
        RolNombre: r.nombre,
        RolDescripcion: r.descripcion ?? "",
        RolEstado: r.estado,
        AplicacionId: String(r.aplicacionId),
        AplicacionNombre:
          (r as RolDB & { aplicacion?: { id: number; nombre: string } }).aplicacion?.nombre ??
          `#${r.aplicacionId}`,
        RolNivel: r.nivel,
        RolFchIns: r.fechaCreacion,
        RolCreadoEn: r.creadoEn ?? undefined,
        asignado: rolesAsignadosIds.has(r.id),
      }));

      setRoles(rolesConAsignacion);
      setFilteredRoles(rolesConAsignacion);

      const rolesAsignadosSeleccionados = rolesConAsignacion
        .filter((rol) => rol.asignado)
        .map((rol) => rol.RolId);

      setSelectedRoles(rolesAsignadosSeleccionados);
    } catch (error) {
      console.error("[AsignarRolesModal] Error cargando roles:", error);
      toast.error("Error al cargar la lista de roles");
    } finally {
      setLoadingRoles(false);
    }
  };

  const handleRoleToggle = (rolId: number) => {
    setSelectedRoles((prev) =>
      prev.includes(rolId)
        ? prev.filter((id) => id !== rolId)
        : [...prev, rolId],
    );
  };

  const handleDateRangeChange = (
    rolId: number,
    dateRange: DateRange | undefined,
  ) => {
    setRoleDateRanges((prev) => ({
      ...prev,
      [rolId]: dateRange,
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      if (isNaN(userId)) {
        toast.error("Error: ID de usuario inválido");
        return;
      }

      const rolesPayload = selectedRoles.map((rolId) => {
        const dateRange = roleDateRanges[rolId];
        return {
          rolId,
          fechaDesde: dateRange?.from ? dateRange.from.toISOString() : undefined,
          fechaHasta: dateRange?.to ? dateRange.to.toISOString() : undefined,
        };
      });

      const response = await apiAsignarRolesDB(userId, rolesPayload);

      if (response?.success !== false) {
        toast.success("Roles asignados correctamente");
        onClose();
      } else {
        toast.error(response?.error || "Error al asignar roles");
      }
    } catch (error) {
      console.error("[AsignarRolesModal] Error asignando roles:", error);
      toast.error("Error al asignar roles");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSearchTerm("");
    setSelectedRoles([]);
    setRoleDateRanges({});
    onClose();
  };

  return (
    <ModalShell
      open={isOpen}
      onOpenChange={handleClose}
      title={`Asignar Roles — ${userName}`}
      description="Selecciona los roles que deseas asignar al usuario."
      icon={Users}
      size="lg"
      scrollableBody={false}
      data-no-loading="true"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            <X className="w-4 h-4 mr-2" aria-hidden="true" />
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" aria-hidden="true" />
            {saving ? "Guardando..." : "Guardar Asignación"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col space-y-4 h-full">
        {/* Buscador + filtro por aplicación */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 space-y-2">
            <Label htmlFor="search-roles">Buscar Rol</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="search-roles"
                placeholder="Buscar por nombre, descripción o aplicación..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Aplicación</Label>
            <Select value={aplicacionFiltro} onValueChange={setAplicacionFiltro}>
              <SelectTrigger className="w-full sm:w-48">
                {aplicacionFiltro === "todos"
                  ? "Todas"
                  : aplicaciones.find((a) => a.id === aplicacionFiltro)?.nombre ?? "Aplicación"}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {aplicaciones.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Lista de roles */}
        <div className="overflow-auto border rounded-lg max-h-[50vh]">
          {loadingRoles ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-sm text-muted-foreground">
                  Cargando roles...
                </p>
              </div>
            </div>
          ) : filteredRoles.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              {searchTerm
                ? "No se encontraron roles con ese criterio"
                : "No hay roles disponibles"}
            </div>
          ) : (
            <div className="divide-y">
              {filteredRoles.map((rol) => (
                <div
                  key={rol.RolId}
                  className="flex items-center space-x-4 p-4 hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    id={`rol-${rol.RolId}`}
                    checked={selectedRoles.includes(rol.RolId)}
                    onCheckedChange={() => handleRoleToggle(rol.RolId)}
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor={`rol-${rol.RolId}`}
                        className="font-medium cursor-pointer"
                      >
                        {rol.RolNombre}
                      </label>
                      <Badge variant="outline" className="text-xs">
                        {rol.AplicacionNombre}
                      </Badge>
                      {rol.asignado && (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-800"
                        >
                          Asignado
                        </Badge>
                      )}
                      {selectedRoles.includes(rol.RolId) && !rol.asignado && (
                        <Badge
                          variant="secondary"
                          className="bg-blue-100 text-blue-800"
                        >
                          Seleccionado
                        </Badge>
                      )}
                    </div>
                    {rol.RolDescripcion && (
                      <p className="text-sm text-muted-foreground">
                        {rol.RolDescripcion}
                      </p>
                    )}
                    <div className="pt-2">
                      <DateRangePicker
                        date={roleDateRanges[rol.RolId]}
                        onDateChange={(dateRange) =>
                          handleDateRangeChange(rol.RolId, dateRange)
                        }
                        placeholder="Rango de vigencia (opcional)"
                        disabled={!selectedRoles.includes(rol.RolId)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
