"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Save, Key, RotateCcw, Users, Settings, Shield } from "lucide-react";
import { apiUsuarioDBById, apiCrearUsuarioDB, apiActualizarUsuarioDB } from "@/services/api";
import AsignarRolesModal from "./AsignarRolesModal";
import AtributosModal from "./AtributosModal";
import AsignarFuncionalidadesModal from "./AsignarFuncionalidadesModal";
import { useFormData } from "@/hooks/useFormData";

interface UsuarioFormProps {
  mode: "create" | "edit";
  userId?: string;
}

type UsuarioFormFields = {
  username: string;
  password: string;
  email: string;
  nombre: string;
  apellido: string;
  estado: string;
  telefono: string;
  tipoUsuario: string;
  esExterno: string;
  usuarioExterno: string;
  esRoot: string;
  desdeSistema: string;
  modificaPermisos: string;
  cambioPassword: string;
  fechaCreacion: string;
  fechaBaja: string;
  fechaUltimoLogin: string;
  intentosFallidos: string;
  fechaUltimoBloqueo: string;
  observacion: string;
};

const initialFormFields: UsuarioFormFields = {
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
};

export default function UsuarioForm({ mode, userId }: UsuarioFormProps) {
  const router = useRouter();
  const { data, setField, setData, errors, setFieldError, loading: submitting, setLoading } = useFormData<UsuarioFormFields>(initialFormFields);

  // Local state for fields/interactions not owned by useFormData
  const [initialLoading, setInitialLoading] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [showAtributosModal, setShowAtributosModal] = useState(false);
  const [showFuncionalidadesModal, setShowFuncionalidadesModal] = useState(false);

  useEffect(() => {
    if (mode === "edit" && userId) {
      const loadUserData = async () => {
        try {
          setInitialLoading(true);
          const response = await apiUsuarioDBById(parseInt(userId));

          if (response.success && response.usuario) {
            const u = response.usuario;
            setData({
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

    // Validate required fields
    let hasErrors = false;
    if (mode === "create") {
      if (!data.username.trim()) {
        setFieldError("username", "El nombre de usuario es obligatorio");
        hasErrors = true;
      }
      if (!data.password.trim()) {
        setFieldError("password", "La contraseña es obligatoria");
        hasErrors = true;
      }
      if (!data.nombre.trim()) {
        setFieldError("nombre", "El nombre es obligatorio");
        hasErrors = true;
      }
    }

    if (hasErrors) {
      toast.error("Por favor, corrige los errores antes de continuar");
      return;
    }

    setLoading(true);
    try {
      if (mode === "create") {
        await apiCrearUsuarioDB({
          username: data.username,
          password: data.password,
          email: data.email || undefined,
          nombre: data.nombre || undefined,
          apellido: data.apellido || undefined,
          estado: data.estado,
          telefono: data.telefono || undefined,
          tipoUsuario: data.tipoUsuario,
          esExterno: data.esExterno,
          usuarioExterno: data.usuarioExterno || undefined,
          esRoot: data.esRoot,
          desdeSistema: data.desdeSistema,
        });
        toast.success("Usuario creado exitosamente");
      } else {
        await apiActualizarUsuarioDB(parseInt(userId || "0"), {
          email: data.email || null,
          nombre: data.nombre || null,
          apellido: data.apellido || null,
          estado: data.estado,
          telefono: data.telefono || null,
          tipoUsuario: data.tipoUsuario,
          esExterno: data.esExterno,
          usuarioExterno: data.usuarioExterno || null,
          esRoot: data.esRoot,
          desdeSistema: data.desdeSistema,
          modificaPermisos: data.modificaPermisos,
          cambioPassword: data.cambioPassword,
          observacion: data.observacion || null,
          fechaBaja: data.fechaBaja || null,
          password: data.password !== "********" ? data.password : undefined,
        } as unknown as Parameters<typeof apiActualizarUsuarioDB>[1]);
        toast.success("Usuario actualizado exitosamente");
      }
      router.push("/dashboard/usuarios");
    } catch (error: unknown) {
      toast.error((error as Error).message || "Error al guardar el usuario");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = () => {
    const newPassword = data.username;
    setField("password", newPassword);
    setShowPasswordReset(true);
    toast.success(`Contraseña establecida como: ${newPassword}`);
  };

  if (initialLoading && mode === "edit") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
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
                <Users className="w-4 h-4" aria-hidden="true" />
                Asignar Roles
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowFuncionalidadesModal(true)}
                className="flex items-center gap-2"
                data-no-loading="true"
              >
                <Shield className="w-4 h-4" aria-hidden="true" />
                Asignar Funcionalidades
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAtributosModal(true)}
                className="flex items-center gap-2"
                data-no-loading="true"
              >
                <Settings className="w-4 h-4" aria-hidden="true" />
                Atributos
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handlePasswordReset}
                className="flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
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
            disabled={submitting}
            className="flex items-center gap-2"
          >
            <Save className="w-4 h-4" aria-hidden="true" />
            {submitting
              ? "Guardando..."
              : mode === "edit"
                ? "Actualizar Usuario"
                : "Crear Usuario"}
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Información Básica */}
        <fieldset className="rounded-lg border p-6 space-y-4">
          <legend className="text-lg font-semibold px-2">Información Básica</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1">
              <Label htmlFor="userName">
                Usuario{" "}
                <span aria-label="requerido" className="text-destructive">*</span>
              </Label>
              <Input
                id="userName"
                value={data.username}
                onChange={(e) => setField("username", e.target.value)}
                onBlur={() => {
                  if (mode === "create" && !data.username.trim()) {
                    setFieldError("username", "El nombre de usuario es obligatorio");
                  }
                }}
                placeholder="Nombre de usuario"
                required
                disabled={mode === "edit"}
                aria-invalid={!!errors.username}
                aria-describedby={errors.username ? "username-error" : undefined}
              />
              {errors.username && (
                <p id="username-error" className="text-sm text-destructive" role="alert">
                  {errors.username}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={data.email}
                onChange={(e) => setField("email", e.target.value)}
                placeholder="correo@ejemplo.com"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="nombre">
                Nombre{" "}
                {mode === "create" && (
                  <span aria-label="requerido" className="text-destructive">*</span>
                )}
              </Label>
              <Input
                id="nombre"
                value={data.nombre}
                onChange={(e) => setField("nombre", e.target.value)}
                onBlur={() => {
                  if (mode === "create" && !data.nombre.trim()) {
                    setFieldError("nombre", "El nombre es obligatorio");
                  }
                }}
                placeholder="Nombre"
                aria-invalid={!!errors.nombre}
                aria-describedby={errors.nombre ? "nombre-error" : undefined}
              />
              {errors.nombre && (
                <p id="nombre-error" className="text-sm text-destructive" role="alert">
                  {errors.nombre}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="apellido">Apellido</Label>
              <Input
                id="apellido"
                value={data.apellido}
                onChange={(e) => setField("apellido", e.target.value)}
                placeholder="Apellido"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input
                id="telefono"
                value={data.telefono}
                onChange={(e) => setField("telefono", e.target.value)}
                placeholder="+598 99 123 456"
              />
            </div>
          </div>
        </fieldset>

        {/* Contraseña y Seguridad */}
        <fieldset className="rounded-lg border p-6 space-y-4">
          <legend className="text-lg font-semibold px-2">Contraseña y Seguridad</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1">
              <Label htmlFor="password">
                Contraseña{" "}
                {mode === "create" && (
                  <span aria-label="requerido" className="text-destructive">*</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="password"
                  type="password"
                  value={data.password}
                  onChange={(e) => setField("password", e.target.value)}
                  onBlur={() => {
                    if (mode === "create" && !data.password.trim()) {
                      setFieldError("password", "La contraseña es obligatoria");
                    }
                  }}
                  placeholder={mode === "edit" ? "********" : "Contraseña"}
                  disabled={mode === "edit" && !showPasswordReset}
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "password-error" : "password-hint"}
                />
                {mode === "edit" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePasswordReset}
                    className="shrink-0"
                    aria-label="Resetear contraseña al nombre de usuario"
                  >
                    <Key className="w-4 h-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
              {errors.password && (
                <p id="password-error" className="text-sm text-destructive" role="alert">
                  {errors.password}
                </p>
              )}
              {mode === "edit" && !errors.password && (
                <p id="password-hint" className="text-xs text-muted-foreground">
                  Haz clic en el icono para establecer la contraseña como el
                  nombre de usuario
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="intentosFallidos">Intentos Fallidos</Label>
              <Input
                id="intentosFallidos"
                value={data.intentosFallidos}
                onChange={(e) => setField("intentosFallidos", e.target.value)}
                placeholder="0"
                type="number"
                disabled={mode === "create"}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="fechaUltBloqueo">Fecha Último Bloqueo</Label>
              <Input
                id="fechaUltBloqueo"
                value={data.fechaUltimoBloqueo}
                onChange={(e) => setField("fechaUltimoBloqueo", e.target.value)}
                type="datetime-local"
                disabled={mode === "create"}
              />
            </div>
          </div>
        </fieldset>

        {/* Configuración del Usuario */}
        <fieldset className="rounded-lg border p-6 space-y-4">
          <legend className="text-lg font-semibold px-2">Configuración del Usuario</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1">
              <Label htmlFor="estado">Estado</Label>
              <Select
                value={data.estado}
                onValueChange={(value) => setField("estado", value)}
              >
                <SelectTrigger id="estado">
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Activo</SelectItem>
                  <SelectItem value="I">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="tipoUsuario">Tipo de Usuario</Label>
              <Select
                value={data.tipoUsuario}
                onValueChange={(value) => setField("tipoUsuario", value)}
              >
                <SelectTrigger id="tipoUsuario">
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
                  checked={data.esRoot === "S"}
                  onCheckedChange={(checked) =>
                    setField("esRoot", checked ? "S" : "N")
                  }
                  aria-label="Usuario root"
                />
                <span className="text-sm text-muted-foreground">
                  {data.esRoot === "S" ? "Sí" : "No"}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Usuario Externo</Label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={data.esExterno === "S"}
                  onCheckedChange={(checked) =>
                    setField("esExterno", checked ? "S" : "N")
                  }
                  aria-label="Usuario externo"
                />
                <span className="text-sm text-muted-foreground">
                  {data.esExterno === "S" ? "Habilitado" : "Deshabilitado"}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Desde Sistema</Label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={data.desdeSistema === "S"}
                  onCheckedChange={(checked) =>
                    setField("desdeSistema", checked ? "S" : "N")
                  }
                  aria-label="Desde sistema"
                />
                <span className="text-sm text-muted-foreground">
                  {data.desdeSistema === "S" ? "Sí" : "No"}
                </span>
              </div>
            </div>

            {data.esExterno === "S" && (
              <div className="space-y-1">
                <Label htmlFor="userExterno">Usuario Externo</Label>
                <Input
                  id="userExterno"
                  value={data.usuarioExterno}
                  onChange={(e) => setField("usuarioExterno", e.target.value)}
                  placeholder="Usuario para autenticación externa"
                />
              </div>
            )}
          </div>
        </fieldset>

        {/* Fechas e Historial */}
        <fieldset className="rounded-lg border p-6 space-y-4">
          <legend className="text-lg font-semibold px-2">Fechas e Historial</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1">
              <Label htmlFor="fechaCreacion">Fecha de Creación</Label>
              <Input
                id="fechaCreacion"
                value={data.fechaCreacion}
                type="date"
                disabled
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="fechaBaja">Fecha de Baja</Label>
              <Input
                id="fechaBaja"
                value={data.fechaBaja}
                onChange={(e) => setField("fechaBaja", e.target.value)}
                type="date"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="fechaUltLogin">Fecha Último Login</Label>
              <Input
                id="fechaUltLogin"
                value={data.fechaUltimoLogin}
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
        </fieldset>
      </form>

      {/* Modal de Asignación de Roles */}
      <AsignarRolesModal
        isOpen={showRolesModal}
        onClose={() => setShowRolesModal(false)}
        userId={parseInt(userId || "0")}
        userName={data.username || "Usuario"}
      />

      {/* Modal de Atributos */}
      <AtributosModal
        isOpen={showAtributosModal}
        onClose={() => setShowAtributosModal(false)}
        userId={parseInt(userId || "0")}
        userName={data.username || "Usuario"}
      />

      {/* Modal de Asignacion de Funcionalidades */}
      <AsignarFuncionalidadesModal
        isOpen={showFuncionalidadesModal}
        onClose={() => setShowFuncionalidadesModal(false)}
        userId={parseInt(userId || "0")}
        userName={data.username || "Usuario"}
      />
    </div>
  );
}
