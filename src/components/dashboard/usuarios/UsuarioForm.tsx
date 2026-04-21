"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Save, Key, RotateCcw, Users, Settings } from "lucide-react";
import { apiUsuarioDBById, apiCrearUsuarioDB, apiActualizarUsuarioDB } from "@/services/api";
import AsignarRolesModal from "./AsignarRolesModal";
import AtributosModal from "./AtributosModal";

interface UsuarioFormProps {
  mode: "create" | "edit";
  userId?: string;
}

export default function UsuarioForm({ mode, userId }: UsuarioFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    email: "",
    nombre: "",
    apellido: "",
    estado: "A",
    telefono: "",
    tipoUsuario: "L",
    esExterno: "N",
    usuarioExterno: "",
    esRoot: "N",
    desdeSistema: "N",
    modificaPermisos: "N",
    cambioPassword: "N",
    fechaCreacion: "",
    fechaBaja: "",
    fechaUltimoLogin: "",
    intentosFallidos: "0",
    fechaUltimoBloqueo: "",
    observacion: "",
  });
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [showAtributosModal, setShowAtributosModal] = useState(false);

  useEffect(() => {
    if (mode === "edit" && userId) {
      const loadUserData = async () => {
        try {
          setInitialLoading(true);
          const response = await apiUsuarioDBById(parseInt(userId));

          if (response.success && response.usuario) {
            const u = response.usuario;
            setFormData({
              username: u.username || "",
              password: "********",
              email: u.email || "",
              nombre: u.nombre || "",
              apellido: u.apellido || "",
              estado: u.estado || "A",
              telefono: u.telefono || "",
              tipoUsuario: u.tipoUsuario || "L",
              esExterno: u.esExterno || "N",
              usuarioExterno: u.usuarioExterno || "",
              esRoot: u.esRoot || "N",
              desdeSistema: u.desdeSistema || "N",
              modificaPermisos: u.modificaPermisos || "N",
              cambioPassword: u.cambioPassword || "N",
              fechaCreacion: u.fechaCreacion ? new Date(u.fechaCreacion).toISOString().slice(0, 10) : "",
              fechaBaja: u.fechaBaja ? new Date(u.fechaBaja).toISOString().slice(0, 10) : "",
              fechaUltimoLogin: u.fechaUltimoLogin ? new Date(u.fechaUltimoLogin).toISOString().slice(0, 16) : "",
              intentosFallidos: String(u.intentosFallidos ?? 0),
              fechaUltimoBloqueo: u.fechaUltimoBloqueo ? new Date(u.fechaUltimoBloqueo).toISOString().slice(0, 16) : "",
              observacion: u.observacion || "",
            });
          } else {
            toast.error("Usuario no encontrado");
            router.push("/dashboard/usuarios");
          }
        } catch (error) {
          console.error("Error cargando usuario:", error);
          toast.error("Error al cargar los datos del usuario");
        } finally {
          setInitialLoading(false);
        }
      };

      loadUserData();
    }
  }, [mode, userId, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "create") {
        if (!formData.username || !formData.password) {
          toast.error("Usuario y contraseña son requeridos");
          setLoading(false);
          return;
        }

        await apiCrearUsuarioDB({
          username: formData.username,
          password: formData.password,
          email: formData.email || undefined,
          nombre: formData.nombre || undefined,
          apellido: formData.apellido || undefined,
          estado: formData.estado,
          telefono: formData.telefono || undefined,
          tipoUsuario: formData.tipoUsuario,
          esExterno: formData.esExterno,
          usuarioExterno: formData.usuarioExterno || undefined,
          esRoot: formData.esRoot,
          desdeSistema: formData.desdeSistema,
        });
        toast.success("Usuario creado exitosamente");
      } else {
        await apiActualizarUsuarioDB(parseInt(userId || "0"), {
          email: formData.email || null,
          nombre: formData.nombre || null,
          apellido: formData.apellido || null,
          estado: formData.estado,
          telefono: formData.telefono || null,
          tipoUsuario: formData.tipoUsuario,
          esExterno: formData.esExterno,
          usuarioExterno: formData.usuarioExterno || null,
          esRoot: formData.esRoot,
          desdeSistema: formData.desdeSistema,
          modificaPermisos: formData.modificaPermisos,
          cambioPassword: formData.cambioPassword,
          observacion: formData.observacion || null,
          fechaBaja: formData.fechaBaja || null,
          password: formData.password !== "********" ? formData.password : undefined,
        } as any);
        toast.success("Usuario actualizado exitosamente");
      }
      router.push("/dashboard/usuarios");
    } catch (error: any) {
      toast.error(error.message || "Error al guardar el usuario");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = () => {
    const newPassword = formData.username;
    setFormData((prev) => ({ ...prev, password: newPassword }));
    setShowPasswordReset(true);
    toast.success(`Contraseña establecida como: ${newPassword}`);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (initialLoading && mode === "edit") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/usuarios")}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </Button>

        <div className="flex gap-2">
          {mode === "edit" && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowRolesModal(true)}
                className="flex items-center gap-2"
                data-no-loading="true"
              >
                <Users className="w-4 h-4" />
                Asignar Roles
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAtributosModal(true)}
                className="flex items-center gap-2"
                data-no-loading="true"
              >
                <Settings className="w-4 h-4" />
                Atributos
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handlePasswordReset}
                className="flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Resetear Contraseña
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/usuarios")}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {loading
              ? "Guardando..."
              : mode === "edit"
                ? "Actualizar Usuario"
                : "Crear Usuario"}
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Información Básica */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Información Básica</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="userName">Usuario *</Label>
              <Input
                id="userName"
                value={formData.username}
                onChange={(e) =>
                  handleInputChange("username", e.target.value)
                }
                placeholder="Nombre de usuario"
                required
                disabled={mode === "edit"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  handleInputChange("email", e.target.value)
                }
                placeholder="correo@ejemplo.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) =>
                  handleInputChange("nombre", e.target.value)
                }
                placeholder="Nombre"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apellido">Apellido</Label>
              <Input
                id="apellido"
                value={formData.apellido}
                onChange={(e) =>
                  handleInputChange("apellido", e.target.value)
                }
                placeholder="Apellido"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input
                id="telefono"
                value={formData.telefono}
                onChange={(e) =>
                  handleInputChange("telefono", e.target.value)
                }
                placeholder="+598 99 123 456"
              />
            </div>
          </div>
        </Card>

        {/* Contraseña y Seguridad */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Contraseña y Seguridad</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="flex gap-2">
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    handleInputChange("password", e.target.value)
                  }
                  placeholder={mode === "edit" ? "********" : "Contraseña"}
                  disabled={mode === "edit" && !showPasswordReset}
                />
                {mode === "edit" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePasswordReset}
                    className="shrink-0"
                  >
                    <Key className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {mode === "edit" && (
                <p className="text-xs text-muted-foreground">
                  Haz clic en el icono para establecer la contraseña como el
                  nombre de usuario
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="intentosFallidos">Intentos Fallidos</Label>
              <Input
                id="intentosFallidos"
                value={formData.intentosFallidos}
                onChange={(e) =>
                  handleInputChange("intentosFallidos", e.target.value)
                }
                placeholder="0"
                type="number"
                disabled={mode === "create"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fechaUltBloqueo">Fecha Último Bloqueo</Label>
              <Input
                id="fechaUltBloqueo"
                value={formData.fechaUltimoBloqueo}
                onChange={(e) =>
                  handleInputChange("fechaUltimoBloqueo", e.target.value)
                }
                type="datetime-local"
                disabled={mode === "create"}
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
                onValueChange={(value) =>
                  handleInputChange("estado", value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar estado" />
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
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="G">Global</SelectItem>
                  <SelectItem value="L">Local</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Usuario Root</Label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.esRoot === "S"}
                  onCheckedChange={(checked) =>
                    handleInputChange("esRoot", checked ? "S" : "N")
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {formData.esRoot === "S" ? "Sí" : "No"}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Usuario Externo</Label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.esExterno === "S"}
                  onCheckedChange={(checked) =>
                    handleInputChange("esExterno", checked ? "S" : "N")
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {formData.esExterno === "S"
                    ? "Habilitado"
                    : "Deshabilitado"}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Desde Sistema</Label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.desdeSistema === "S"}
                  onCheckedChange={(checked) =>
                    handleInputChange("desdeSistema", checked ? "S" : "N")
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {formData.desdeSistema === "S" ? "Sí" : "No"}
                </span>
              </div>
            </div>

            {formData.esExterno === "S" && (
              <div className="space-y-2">
                <Label htmlFor="userExterno">Usuario Externo</Label>
                <Input
                  id="userExterno"
                  value={formData.usuarioExterno}
                  onChange={(e) =>
                    handleInputChange("usuarioExterno", e.target.value)
                  }
                  placeholder="Usuario para autenticación externa"
                />
              </div>
            )}
          </div>
        </Card>

        {/* Fechas e Historial */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Fechas e Historial</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="fechaCreacion">Fecha de Creación</Label>
              <Input
                id="fechaCreacion"
                value={formData.fechaCreacion}
                type="date"
                disabled
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fechaBaja">Fecha de Baja</Label>
              <Input
                id="fechaBaja"
                value={formData.fechaBaja}
                onChange={(e) =>
                  handleInputChange("fechaBaja", e.target.value)
                }
                type="date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fechaUltLogin">Fecha Último Login</Label>
              <Input
                id="fechaUltLogin"
                value={formData.fechaUltimoLogin}
                type="datetime-local"
                disabled
              />
              {mode === "create" && (
                <p className="text-xs text-muted-foreground">
                  Se establecerá automáticamente en el primer login
                </p>
              )}
            </div>
          </div>
        </Card>
      </form>

      {/* Modal de Asignación de Roles */}
      <AsignarRolesModal
        isOpen={showRolesModal}
        onClose={() => setShowRolesModal(false)}
        userId={parseInt(userId || "0")}
        userName={formData.username || "Usuario"}
      />

      {/* Modal de Atributos */}
      <AtributosModal
        isOpen={showAtributosModal}
        onClose={() => setShowAtributosModal(false)}
        userId={parseInt(userId || "0")}
        userName={formData.username || "Usuario"}
      />
    </div>
  );
}
