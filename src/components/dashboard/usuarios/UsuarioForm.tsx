"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Save, Key, RotateCcw, Users, Settings } from "lucide-react";
import { apiUsuarios } from "@/services/api";
import AsignarRolesModal from "./AsignarRolesModal";
import AtributosModal from "./AtributosModal";

interface UsuarioFormProps {
  mode: "create" | "edit";
  userId?: string;
}

export default function UsuarioForm({ mode, userId }: UsuarioFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    UserExtendedUserName: "",
    UserExtendedPassword: "",
    UserExtendedEmail: "",
    UserExtendedNombre: "",
    UserExtendedApellido: "",
    UserExtendedEstado: "S",
    UserExtendedTelefono: "",
    UserExtendedTipoUser: "L",
    UserExtendedExterno: "N",
    UserExtendedUserExterno: "",
    UserExtendedRoot: "N",
    UserExtendedFechaIngreso: "",
    UserExtendedFechaBaja: "",
    UserExtendedFechaUltLogin: "",
    UserExtendedIntentFall: "",
    UserExtendedFecHoraUltBloq: "",
    UserExtendedDesdeSistema: "N",
  });
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [showAtributosModal, setShowAtributosModal] = useState(false);

  useEffect(() => {
    if (mode === "edit" && userId) {
      const loadUserData = async () => {
        try {
          console.log('Cargando datos de usuario - activando loading');
          setLoading(true);
          const response = await apiUsuarios({
            FiltroTexto: "",
            Estado: "",
            sinMigrar: false,
            Pagesize: "1000",
            CurrentPage: "1",
          });
          
          const users = response?.SdtUsuarios || [];
          console.log('Usuarios cargados:', users.length);
          console.log('Buscando usuario con ID:', userId, 'tipo:', typeof userId);
          console.log('Primeros usuarios para comparar IDs:', users.slice(0, 3).map((u: any) => ({ id: u.UserExtendedId, tipo: typeof u.UserExtendedId })));
          const user = users.find((u: any) => u.UserExtendedId === userId || u.UserExtendedId === parseInt(userId || '0'));
          console.log('Usuario encontrado:', user);
          
          if (user) {
            setFormData({
              UserExtendedUserName: user.UserExtendedUserName || "",
              UserExtendedPassword: "********", // No mostrar la contraseña real
              UserExtendedEmail: user.UserExtendedEmail || "",
              UserExtendedNombre: user.UserExtendedNombre || "",
              UserExtendedApellido: user.UserExtendedApellido || "",
              UserExtendedEstado: user.UserExtendedEstado || "S",
              UserExtendedTelefono: user.UserExtendedTelefono || "",
              UserExtendedTipoUser: user.UserExtendedTipoUser || "L",
              UserExtendedExterno: user.UserExtendedExterno || "N",
              UserExtendedUserExterno: user.UserExtendedUserExterno || "",
              UserExtendedRoot: user.UserExtendedRoot || "N",
              UserExtendedFechaIngreso: user.UserExtendedFechaIngreso || "",
              UserExtendedFechaBaja: user.UserExtendedFechaBaja || "",
              UserExtendedFechaUltLogin: user.UserExtendedFechaUltLogin || "",
              UserExtendedIntentFall: user.UserExtendedIntentFall || "",
              UserExtendedFecHoraUltBloq: user.UserExtendedFecHoraUltBloq || "",
              UserExtendedDesdeSistema: user.UserExtendedDesdeSistema || "N",
            });
            console.log('FormData establecido:', {
              UserExtendedEstado: user.UserExtendedEstado,
              formDataEstado: user.UserExtendedEstado || "S"
            });
          } else {
            toast.error("Usuario no encontrado");
            router.push("/dashboard/usuarios");
          }
        } catch (error) {
          console.error("Error cargando usuario:", error);
          toast.error("Error al cargar los datos del usuario");
        } finally {
          console.log('Carga de usuario completada - desactivando loading');
          setLoading(false);
        }
      };
      
      loadUserData();
    }
  }, [mode, userId, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('HandleSubmit llamado - activando loading');
    setLoading(true);

    try {
      if (mode === "create") {
        console.log("Creando usuario:", formData);
        toast.success("Usuario creado exitosamente");
      } else {
        console.log("Actualizando usuario:", formData);
        toast.success("Usuario actualizado exitosamente");
      }
      router.push("/dashboard/usuarios");
    } catch (error) {
      toast.error("Error al guardar el usuario");
    } finally {
      console.log('HandleSubmit completado - desactivando loading');
      setLoading(false);
    }
  };

  const handlePasswordReset = () => {
    const newPassword = formData.UserExtendedUserName;
    setFormData(prev => ({ ...prev, UserExtendedPassword: newPassword }));
    setShowPasswordReset(true);
    toast.success(`Contraseña establecida como: ${newPassword}`);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (loading && mode === "edit") {
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
              >
                <Users className="w-4 h-4" />
                Asignar Roles
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAtributosModal(true)}
                className="flex items-center gap-2"
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
            {loading ? "Guardando..." : mode === "edit" ? "Actualizar Usuario" : "Crear Usuario"}
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
                value={formData.UserExtendedUserName}
                onChange={(e) => handleInputChange("UserExtendedUserName", e.target.value)}
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
                value={formData.UserExtendedEmail}
                onChange={(e) => handleInputChange("UserExtendedEmail", e.target.value)}
                placeholder="correo@ejemplo.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.UserExtendedNombre}
                onChange={(e) => handleInputChange("UserExtendedNombre", e.target.value)}
                placeholder="Nombre"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apellido">Apellido</Label>
              <Input
                id="apellido"
                value={formData.UserExtendedApellido}
                onChange={(e) => handleInputChange("UserExtendedApellido", e.target.value)}
                placeholder="Apellido"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input
                id="telefono"
                value={formData.UserExtendedTelefono}
                onChange={(e) => handleInputChange("UserExtendedTelefono", e.target.value)}
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
                  value={formData.UserExtendedPassword}
                  onChange={(e) => handleInputChange("UserExtendedPassword", e.target.value)}
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
                  Haz clic en el icono para establecer la contraseña como el nombre de usuario
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="intentosFallidos">Intentos Fallidos</Label>
              <Input
                id="intentosFallidos"
                value={formData.UserExtendedIntentFall}
                onChange={(e) => handleInputChange("UserExtendedIntentFall", e.target.value)}
                placeholder="0"
                type="number"
                disabled={mode === "create"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fechaUltBloqueo">Fecha Último Bloqueo</Label>
              <Input
                id="fechaUltBloqueo"
                value={formData.UserExtendedFecHoraUltBloq}
                onChange={(e) => handleInputChange("UserExtendedFecHoraUltBloq", e.target.value)}
                type="datetime-local"
                disabled={mode === "create"}
              />
            </div>
          </div>
        </Card>

        {/* Configuración del Usuario */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Configuración del Usuario</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="estado">Estado</Label>
              <Select
                value={formData.UserExtendedEstado}
                onValueChange={(value) => handleInputChange("UserExtendedEstado", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="S">Activo</SelectItem>
                  <SelectItem value="N">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipoUsuario">Tipo de Usuario</Label>
              <Select
                value={formData.UserExtendedTipoUser}
                onValueChange={(value) => handleInputChange("UserExtendedTipoUser", value)}
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
                  checked={formData.UserExtendedRoot === "S"}
                  onCheckedChange={(checked) =>
                    handleInputChange("UserExtendedRoot", checked ? "S" : "N")
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {formData.UserExtendedRoot === "S" ? "Sí" : "No"}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Usuario Externo</Label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.UserExtendedExterno === "S"}
                  onCheckedChange={(checked) =>
                    handleInputChange("UserExtendedExterno", checked ? "S" : "N")
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {formData.UserExtendedExterno === "S" ? "Habilitado" : "Deshabilitado"}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Desde Sistema</Label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.UserExtendedDesdeSistema === "S"}
                  onCheckedChange={(checked) =>
                    handleInputChange("UserExtendedDesdeSistema", checked ? "S" : "N")
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {formData.UserExtendedDesdeSistema === "S" ? "Sí" : "No"}
                </span>
              </div>
            </div>

            {formData.UserExtendedExterno === "S" && (
              <div className="space-y-2">
                <Label htmlFor="userExterno">Usuario Externo</Label>
                <Input
                  id="userExterno"
                  value={formData.UserExtendedUserExterno}
                  onChange={(e) => handleInputChange("UserExtendedUserExterno", e.target.value)}
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
              <Label htmlFor="fechaIngreso">Fecha de Ingreso</Label>
              <Input
                id="fechaIngreso"
                value={formData.UserExtendedFechaIngreso}
                onChange={(e) => handleInputChange("UserExtendedFechaIngreso", e.target.value)}
                type="date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fechaBaja">Fecha de Baja</Label>
              <Input
                id="fechaBaja"
                value={formData.UserExtendedFechaBaja}
                onChange={(e) => handleInputChange("UserExtendedFechaBaja", e.target.value)}
                type="date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fechaUltLogin">Fecha Último Login</Label>
              <Input
                id="fechaUltLogin"
                value={formData.UserExtendedFechaUltLogin}
                onChange={(e) => handleInputChange("UserExtendedFechaUltLogin", e.target.value)}
                type="datetime-local"
                disabled={mode === "create"}
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
        userName={formData.UserExtendedUserName || "Usuario"}
      />

      {/* Modal de Atributos */}
      <AtributosModal
        isOpen={showAtributosModal}
        onClose={() => setShowAtributosModal(false)}
        userId={parseInt(userId || "0")}
        userName={formData.UserExtendedUserName || "Usuario"}
      />
    </div>
  );
}
