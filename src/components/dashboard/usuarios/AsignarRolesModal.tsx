"use client";

import React, { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Search, Save, X } from "lucide-react";
import { toast } from "sonner";
import {
  apiRoles,
  apiSetRol,
  apiGetRolUsuario,
  SetRolReq,
  GetRolUsuarioReq,
} from "@/services/api";
import { DateRange } from "react-day-picker";

interface Rol {
  RolId: number;
  RolNombre: string;
  RolDescripcion: string;
  RolEstado: string;
  AplicacionId: string;
  RolNivel?: string | number;
  RolFchIns?: string;
  RolCreadoEn?: string;
  esRoot?: string;
  // Agregamos este campo para saber si ya está asignado
  asignado?: boolean;
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
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const [roleDateRanges, setRoleDateRanges] = useState<
    Record<number, DateRange | undefined>
  >({});

  // Debug para detectar cambios de loading
  useEffect(() => {
    console.log("Loading states changed:", { loadingRoles, saving });
  }, [loadingRoles, saving]);

  // Cargar roles cuando se abra el modal
  useEffect(() => {
    if (isOpen) {
      loadRoles();
    }
  }, [isOpen]);

  // Filtrar roles cuando cambie el término de búsqueda
  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredRoles(roles);
    } else {
      const filtered = roles.filter(
        (rol) =>
          rol.RolNombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
          rol.RolDescripcion.toLowerCase().includes(searchTerm.toLowerCase()),
      );
      setFilteredRoles(filtered);
    }
  }, [searchTerm, roles]);

  const loadRoles = async () => {
    try {
      setLoadingRoles(true);
      console.log("=== INICIO CARGA DE ROLES ===");
      console.log("Iniciando carga de roles para usuario:", userId);

      // Obtener lista de roles disponibles
      console.log("Llamando a apiRoles...");
      const rolesResponse = await apiRoles({
        Estado: "A", // Solo roles activos
        Pagesize: "1000",
        CurrentPage: "1",
      });

      console.log("=== RESPUESTA DE API ROLES ===");
      console.log(
        "Respuesta completa:",
        JSON.stringify(rolesResponse, null, 2),
      );

      // Verificar múltiples formas de acceder a los datos
      const rolesData =
        rolesResponse?.sdtRoles ||
        rolesResponse?.SdtRoles ||
        rolesResponse?.roles ||
        [];
      console.log("=== EXTRACCIÓN DE DATOS ===");
      console.log("rolesResponse?.sdtRoles:", rolesResponse?.sdtRoles);
      console.log("rolesResponse?.SdtRoles:", rolesResponse?.SdtRoles);
      console.log("rolesResponse?.roles:", rolesResponse?.roles);
      console.log("Datos finales extraídos:", rolesData);
      console.log("Tipo de rolesData:", typeof rolesData);
      console.log("Es array?:", Array.isArray(rolesData));
      console.log("Cantidad de roles:", rolesData?.length || 0);

      if (!rolesData || !Array.isArray(rolesData) || rolesData.length === 0) {
        console.error("ERROR: No se encontraron roles válidos en la respuesta");
        console.log("Configurando estado vacío...");
        setRoles([]);
        setFilteredRoles([]);
        return;
      }

      console.log("=== PROCESANDO ROLES ===");
      // Obtener roles ya asignados al usuario específico
      let rolesAsignadosData = [];
      try {
        const userIdNumber = userId;
        console.log("UserId convertido a número:", userIdNumber);

        if (!isNaN(userIdNumber)) {
          console.log("Llamando a apiGetRolUsuario...");
          const rolesAsignadosResponse = await apiGetRolUsuario({
            UserId: userIdNumber,
          });
          console.log("Respuesta de apiGetRolUsuario:", rolesAsignadosResponse);
          console.log("Tipo de respuesta:", typeof rolesAsignadosResponse);
          console.log("Es array?:", Array.isArray(rolesAsignadosResponse));

          // Manejar diferentes tipos de respuesta
          if (Array.isArray(rolesAsignadosResponse)) {
            rolesAsignadosData = rolesAsignadosResponse;
          } else if (
            rolesAsignadosResponse &&
            typeof rolesAsignadosResponse === "object"
          ) {
            // Si es un objeto, verificar si tiene una propiedad con array de roles
            const response = rolesAsignadosResponse as any;
            rolesAsignadosData =
              response.roles || response.sdtRoles || response.SdtRoles || [];
          } else {
            rolesAsignadosData = [];
          }

          console.log("Roles asignados procesados:", rolesAsignadosData);
        } else {
          console.warn("UserId no es un número válido:", userId);
        }
      } catch (error) {
        console.warn(
          "Error obteniendo roles asignados para usuario",
          userId,
          ":",
          error,
        );
        rolesAsignadosData = [];
      }

      // Crear un Set con los IDs de roles ya asignados para búsqueda rápida
      const rolesAsignadosIds = new Set();
      if (Array.isArray(rolesAsignadosData)) {
        rolesAsignadosData.forEach((rol) => {
          if (rol && rol.RolId) {
            const rolId = parseInt(rol.RolId.toString());
            if (!isNaN(rolId)) {
              rolesAsignadosIds.add(rolId);
            }
          }
        });
      }
      console.log("IDs de roles asignados:", Array.from(rolesAsignadosIds));

      // Combinar información de roles disponibles con estado de asignación
      console.log("=== MAPEANDO ROLES ===");
      const rolesConAsignacion = rolesData.map((rol: any, index: number) => {
        console.log(`Procesando rol ${index + 1}:`, rol);

        // Convertir RolId de string a number de forma más robusta
        let rolIdValue = null;
        if (rol.RolId !== undefined && rol.RolId !== null && rol.RolId !== "") {
          const parsed = parseInt(rol.RolId.toString());
          if (!isNaN(parsed)) {
            rolIdValue = parsed;
          }
        }

        const estaAsignado =
          rolIdValue !== null && rolesAsignadosIds.has(rolIdValue);

        const rolProcesado = {
          ...rol,
          RolId: rolIdValue,
          asignado: estaAsignado,
        };

        console.log(`Resultado rol ${index + 1}:`, {
          nombre: rol.RolNombre,
          rolIdOriginal: rol.RolId,
          rolIdProcesado: rolIdValue,
          asignado: estaAsignado,
          rolCompleto: rolProcesado,
        });

        return rolProcesado;
      });

      // Filtrar roles válidos
      const rolesValidos = rolesConAsignacion.filter(
        (rol: any, index: number) => {
          const isValid = rol.RolId !== null;
          console.log(
            `Validando rol ${index + 1} (${rol.RolNombre}): ${isValid ? "VÁLIDO" : "INVÁLIDO"}`,
          );
          if (!isValid) {
            console.warn("Rol filtrado por RolId inválido:", rol);
          }
          return isValid;
        },
      );

      console.log("=== RESULTADO FINAL ===");
      console.log("Total roles procesados:", rolesConAsignacion.length);
      console.log("Total roles válidos:", rolesValidos.length);
      console.log("Roles válidos finales:", rolesValidos);

      setRoles(rolesValidos);
      setFilteredRoles(rolesValidos);

      // Inicializar roles seleccionados con los ya asignados
      const rolesAsignadosSeleccionados = rolesValidos
        .filter((rol: Rol) => rol.asignado)
        .map((rol: Rol) => rol.RolId);

      console.log(
        "Roles preseleccionados (asignados):",
        rolesAsignadosSeleccionados,
      );
      setSelectedRoles(rolesAsignadosSeleccionados);

      console.log("=== FIN CARGA DE ROLES ===");
    } catch (error) {
      console.error("=== ERROR EN CARGA DE ROLES ===", error);
      toast.error("Error al cargar la lista de roles");
    } finally {
      setLoadingRoles(false);
      console.log("Loading state actualizado a false");
    }
  };

  const handleRoleToggle = (rolId: number) => {
    console.log("Toggle rol:", rolId);
    console.log("Loading states:", { loadingRoles, saving });

    setSelectedRoles((prev) => {
      const newSelection = prev.includes(rolId)
        ? prev.filter((id) => id !== rolId)
        : [...prev, rolId];

      console.log("Roles seleccionados actualizados:", newSelection);
      return newSelection;
    });
  };

  const handleDateRangeChange = (
    rolId: number,
    dateRange: DateRange | undefined,
  ) => {
    console.log("Cambio de rango de fechas para rol:", rolId, dateRange);
    setRoleDateRanges((prev) => ({
      ...prev,
      [rolId]: dateRange,
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      console.log("selectedRoles antes de mapear:", selectedRoles);
      console.log("roleDateRanges:", roleDateRanges);
      console.log("userId:", userId);

      // Convertir userId a número
      const userIdNumber = userId;
      if (isNaN(userIdNumber)) {
        toast.error("Error: ID de usuario inválido");
        return;
      }

      // Preparar datos para la API /setRol
      const rolesConFechas = selectedRoles.map((rolId) => {
        console.log("Procesando rolId:", rolId, "tipo:", typeof rolId);
        console.log(
          "Rango de fechas para rol",
          rolId,
          ":",
          roleDateRanges[rolId],
        );

        const dateRange = roleDateRanges[rolId];
        const fechaDesde = dateRange?.from ? dateRange.from.toISOString() : "";
        const fechaHasta = dateRange?.to ? dateRange.to.toISOString() : "";

        console.log("Fechas procesadas para rol", rolId, ":", {
          desde: fechaDesde,
          hasta: fechaHasta,
        });

        return {
          RolId: rolId,
          UsuarioRolFchDesde: fechaDesde,
          UsuarioRolFchHasta: fechaHasta,
        };
      });

      const payload: SetRolReq = {
        UserId: userIdNumber,
        sdtAsignacionRoles: rolesConFechas,
      };

      console.log("Guardando roles para usuario:", userId);
      console.log("Payload para /setRol:", JSON.stringify(payload, null, 2));

      // Llamar a la API real
      const response = await apiSetRol(payload);

      if (response.success !== false) {
        toast.success("Roles asignados correctamente");
        onClose();
      } else {
        toast.error(response.message || "Error al asignar roles");
      }
    } catch (error) {
      console.error("Error asignando roles:", error);
      toast.error("Error al asignar roles");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    console.log("Cerrando modal de roles");
    setSearchTerm("");
    setSelectedRoles([]);
    setRoleDateRanges({});
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent 
        className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
        data-no-loading="true"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Asignar Roles - {userName}
          </DialogTitle>
          <DialogDescription>
            Selecciona los roles que deseas asignar al usuario.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* Buscador */}
          <div className="space-y-2">
            <Label htmlFor="search">Buscar Rol</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Buscar por nombre o descripción..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Lista de roles */}
          <div className="flex-1 overflow-auto border rounded-lg">
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
                      {/* Selector de rango de fechas */}
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

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Guardando..." : "Guardar Asignación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
