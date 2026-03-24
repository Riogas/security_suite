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
import { toast } from "sonner";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { apiAplicaciones } from "@/services/api";

interface AplicacionFormProps {
  mode: "create" | "edit";
  appId?: string;
}

export default function AplicacionForm({ mode, appId }: AplicacionFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [formData, setFormData] = useState({
    AplicacionNombre: "",
    AplicacionDescripcion: "",
    AplicacionTecnologia: "",
    AplicacionEstado: "A",
  });

  useEffect(() => {
    if (mode === "edit" && appId) {
      const loadAppData = async () => {
        try {
          setInitialLoading(true);
          const response = await apiAplicaciones({
            FiltroTexto: "",
            Estado: "",
            sinMigrar: false,
            Pagesize: "1000",
            CurrentPage: "1",
          });

          const apps =
            response?.sdtAplicaciones ||
            response?.SdtAplicaciones ||
            response?.items ||
            [];
          const app = apps.find(
            (a: any) =>
              String(a.AplicacionId) === String(appId),
          );

          if (app) {
            setFormData({
              AplicacionNombre: app.AplicacionNombre || "",
              AplicacionDescripcion: app.AplicacionDescripcion || "",
              AplicacionTecnologia: app.AplicacionTecnologia || "",
              AplicacionEstado: app.AplicacionEstado || "A",
            });
          } else {
            toast.error("Aplicación no encontrada");
            router.push("/dashboard/aplicaciones");
          }
        } catch (error) {
          console.error("Error cargando aplicación:", error);
          toast.error("Error al cargar los datos de la aplicación");
        } finally {
          setInitialLoading(false);
        }
      };

      loadAppData();
    }
  }, [mode, appId, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.AplicacionNombre.trim()) {
        toast.error("El nombre de la aplicación es obligatorio");
        setLoading(false);
        return;
      }

      // TODO: Conectar con API de creación/edición cuando esté disponible
      console.log(
        mode === "create" ? "Creando aplicación:" : "Editando aplicación:",
        formData,
      );
      toast.success(
        mode === "create"
          ? "Aplicación creada exitosamente"
          : "Aplicación actualizada exitosamente",
      );
      router.push("/dashboard/aplicaciones");
    } catch (error) {
      console.error("Error guardando aplicación:", error);
      toast.error("Error al guardar la aplicación");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Cargando datos...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="AplicacionNombre">Nombre *</Label>
          <Input
            id="AplicacionNombre"
            value={formData.AplicacionNombre}
            onChange={(e) => handleChange("AplicacionNombre", e.target.value)}
            placeholder="Nombre de la aplicación"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="AplicacionTecnologia">Tecnología</Label>
          <Input
            id="AplicacionTecnologia"
            value={formData.AplicacionTecnologia}
            onChange={(e) =>
              handleChange("AplicacionTecnologia", e.target.value)
            }
            placeholder="Ej: GeneXus, .NET, React..."
          />
        </div>

        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="AplicacionDescripcion">Descripción</Label>
          <Input
            id="AplicacionDescripcion"
            value={formData.AplicacionDescripcion}
            onChange={(e) =>
              handleChange("AplicacionDescripcion", e.target.value)
            }
            placeholder="Descripción de la aplicación"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="AplicacionEstado">Estado</Label>
          <Select
            value={formData.AplicacionEstado}
            onValueChange={(v) => handleChange("AplicacionEstado", v)}
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
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/dashboard/aplicaciones")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {mode === "create" ? "Crear" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
