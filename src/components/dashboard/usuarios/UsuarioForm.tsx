"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Save, Eye, EyeOff } from "lucide-react";

interface UsuarioFormProps {
  mode: "create" | "edit";
  userId?: string;
}

interface UsuarioData {
  id: string;
  userName: string;
  password: string;
  email: string;
  nombre: string;
  apellido: string;
  estado: string;
  fchIns: string;
  fchBaja: string;
  fchUltLog: string;
  externo: boolean;
  userExterno: string;
  tipoUsuario: string;
  modPerm: boolean;
  cambioPass: boolean;
  cantFail: number;
  fchUltBloqueo: string;
  telefono: string;
  creadoPor: string;
  fchUltPerm: string;
  observacion: string;
  observacion2: string;
}

export default function UsuarioForm({ mode, userId }: UsuarioFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState<UsuarioData>({
    id: "",
    userName: "",
    password: "",
    email: "",
    nombre: "",
    apellido: "",
    estado: "A",
    fchIns: new Date().toISOString().split("T")[0],
    fchBaja: "",
    fchUltLog: "",
    externo: false,
    userExterno: "",
    tipoUsuario: "L",
    modPerm: false,
    cambioPass: false,
    cantFail: 0,
    fchUltBloqueo: "",
    telefono: "",
    creadoPor: "",
    fchUltPerm: "",
    observacion: "",
    observacion2: "",
  });

  // Mock: Cargar datos del usuario si es modo edición
  useEffect(() => {
    if (mode === "edit" && userId) {
      // Aquí harías la llamada a la API para obtener los datos del usuario
      // Por ahora usamos datos mock
      const mockUserData: UsuarioData = {
        id: "1",
        userName: "jgomez",
        password: "********",
        email: "julio.gomez@ejemplo.com",
        nombre: "Julio",
        apellido: "Gómez",
        estado: "A",
        fchIns: "2024-01-15",
        fchBaja: "",
        fchUltLog: "2025-07-20 10:23",
        externo: false,
        userExterno: "",
        tipoUsuario: "G",
        modPerm: true,
        cambioPass: false,
        cantFail: 0,
        fchUltBloqueo: "",
        telefono: "+598 99 123 456",
        creadoPor: "admin",
        fchUltPerm: "2025-07-20",
        observacion: "Usuario administrador principal",
        observacion2: "Acceso completo al sistema",
      };
      setFormData(mockUserData);
    }
  }, [mode, userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Aquí harías la llamada a la API
      if (mode === "create") {
        console.log("Creando usuario:", formData);
        toast.success("Usuario creado exitosamente");
      } else {
        console.log("Actualizando usuario:", formData);
        toast.success("Usuario actualizado exitosamente");
      }

      // Redirigir de vuelta a la lista
      router.push("/dashboard/usuarios");
    } catch (error) {
      toast.error("Error al guardar el usuario");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (
    field: keyof UsuarioData,
    value: string | boolean | number,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/usuarios")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard/usuarios")}
          >
            Cancelar
          </Button>
          <Button type="submit" form="usuario-form" disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            {loading
              ? "Guardando..."
              : mode === "create"
                ? "Crear Usuario"
                : "Actualizar Usuario"}
          </Button>
        </div>
      </div>

      <form id="usuario-form" onSubmit={handleSubmit} className="space-y-8">
        {/* Información Básica */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Información Básica</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="userName">Usuario *</Label>
              <Input
                id="userName"
                value={formData.userName}
                onChange={(e) => handleInputChange("userName", e.target.value)}
                placeholder="Ingrese el nombre de usuario"
                required
                disabled={mode === "edit"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) =>
                    handleInputChange("password", e.target.value)
                  }
                  placeholder={
                    mode === "edit"
                      ? "Dejar vacío para mantener actual"
                      : "Ingrese la contraseña"
                  }
                  required={mode === "create"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                placeholder="Ingrese el email"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) => handleInputChange("nombre", e.target.value)}
                placeholder="Ingrese el nombre"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apellido">Apellido *</Label>
              <Input
                id="apellido"
                value={formData.apellido}
                onChange={(e) => handleInputChange("apellido", e.target.value)}
                placeholder="Ingrese el apellido"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input
                id="telefono"
                value={formData.telefono}
                onChange={(e) => handleInputChange("telefono", e.target.value)}
                placeholder="Ej: +598 99 123 456"
              />
            </div>
          </div>
        </Card>

        {/* Configuración del Usuario */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">
            Configuración del Usuario
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="estado">Estado</Label>
              <Select
                value={formData.estado}
                onValueChange={(value) => handleInputChange("estado", value)}
              >
                <SelectTrigger>
                  {formData.estado === "A" ? "Activo" : "Inactivo"}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Activo</SelectItem>
                  <SelectItem value="I">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipoUsuario">Tipo de Usuario</Label>
              <Select
                value={formData.tipoUsuario}
                onValueChange={(value) =>
                  handleInputChange("tipoUsuario", value)
                }
              >
                <SelectTrigger>
                  {formData.tipoUsuario === "G" ? "Global" : "Local"}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="G">Global</SelectItem>
                  <SelectItem value="L">Local</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Utiliza externo</Label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.externo}
                  onCheckedChange={(checked) =>
                    handleInputChange("externo", checked)
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {formData.externo ? "Habilitado" : "Deshabilitado"}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Puede Modificar Permisos</Label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.modPerm}
                  onCheckedChange={(checked) =>
                    handleInputChange("modPerm", checked)
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {formData.modPerm ? "Permitido" : "No permitido"}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Forzar Cambio de Contraseña</Label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.cambioPass}
                  onCheckedChange={(checked) =>
                    handleInputChange("cambioPass", checked)
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {formData.cambioPass ? "Sí" : "No"}
                </span>
              </div>
            </div>

            {formData.externo && (
              <div className="space-y-2">
                <Label htmlFor="userExterno">Usuario externo</Label>
                <Input
                  id="userExterno"
                  value={formData.userExterno}
                  onChange={(e) =>
                    handleInputChange("userExterno", e.target.value)
                  }
                  placeholder="Usuario para externo"
                />
              </div>
            )}
          </div>
        </Card>

        {/* Observaciones */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Observaciones</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="observacion">Observación Principal</Label>
              <Input
                id="observacion"
                value={formData.observacion}
                onChange={(e) =>
                  handleInputChange("observacion", e.target.value)
                }
                placeholder="Observaciones del usuario"
                maxLength={120}
              />
              <p className="text-xs text-muted-foreground">
                {formData.observacion.length}/120 caracteres
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacion2">Observación Extendida</Label>
              <Input
                id="observacion2"
                value={formData.observacion2}
                onChange={(e) =>
                  handleInputChange("observacion2", e.target.value)
                }
                placeholder="Observaciones adicionales"
                maxLength={120}
              />
              <p className="text-xs text-muted-foreground">
                {formData.observacion2.length}/120 caracteres
              </p>
            </div>
          </div>
        </Card>

        {/* Fechas y Auditoría */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">
            Información de Auditoría
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="cantFail">Intentos Fallidos</Label>
              <Input
                id="cantFail"
                type="number"
                value={formData.cantFail}
                disabled
                placeholder="0"
                className="[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fchIns">Fecha de Creación</Label>
              <Input
                id="fchIns"
                type="datetime-local"
                value={formData.fchIns}
                disabled
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fchBaja">Fecha de Baja</Label>
              <Input
                id="fchBaja"
                type="datetime-local"
                value={formData.fchBaja}
                disabled
                placeholder="No dado de baja"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fchUltLog">Último Login</Label>
              <Input
                id="fchUltLog"
                value={formData.fchUltLog}
                disabled
                placeholder="Nunca"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fchUltBloqueo">Último Bloqueo</Label>
              <Input
                id="fchUltBloqueo"
                value={formData.fchUltBloqueo}
                disabled
                placeholder="Nunca bloqueado"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="creadoPor">Creado Por</Label>
              <Input id="creadoPor" value={formData.creadoPor} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fchUltPerm">Último Permiso</Label>
              <Input
                id="fchUltPerm"
                value={formData.fchUltPerm}
                disabled
                placeholder="Sin permisos asignados"
              />
            </div>
          </div>
        </Card>
      </form>
    </div>
  );
}
