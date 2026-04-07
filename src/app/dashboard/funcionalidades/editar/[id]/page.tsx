"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  apiFuncionalidadDBById,
  apiAccionesFuncionalidadDB,
} from "@/services/api";
import FuncionalidadForm from "@/components/dashboard/funcionalidades/FuncionalidadForm";

export default function EditarFuncionalidadPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [funcionalidad, setFuncionalidad] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFuncionalidad = async () => {
      if (!id) return;

      try {
        setLoading(true);
        const [funcRes, accionesRes] = await Promise.all([
          apiFuncionalidadDBById(parseInt(id)),
          apiAccionesFuncionalidadDB(parseInt(id)),
        ]);

        if (!funcRes?.funcionalidad) {
          setError(`Funcionalidad con ID ${id} no encontrada`);
          return;
        }

        setFuncionalidad({
          ...funcRes.funcionalidad,
          acciones: accionesRes?.acciones ?? [],
        });
      } catch (err) {
        console.error("Error cargando funcionalidad:", err);
        setError("Error cargando la funcionalidad");
      } finally {
        setLoading(false);
      }
    };

    loadFuncionalidad();
  }, [id]);

  const handleSave = (data: any) => {
    console.log("Funcionalidad editada:", data);
    router.push("/dashboard/funcionalidades");
  };

  const handleCancel = () => {
    router.push("/dashboard/funcionalidades");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          <span>Cargando funcionalidad...</span>
        </div>
      </div>
    );
  }

  if (error || !funcionalidad) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-lg font-medium text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">
            {error || "Funcionalidad no encontrada"}
          </p>
          <button
            onClick={() => router.push("/dashboard/funcionalidades")}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Volver a Funcionalidades
          </button>
        </div>
      </div>
    );
  }

  const initialData = {
    id: String(funcionalidad.id),
    aplicacion: String(funcionalidad.aplicacionId),
    nombre: funcionalidad.nombre,
    estado: (funcionalidad.estado ?? "A") as "A" | "I",
    esPublico: funcionalidad.esPublico === "S",
    soloRoot: funcionalidad.soloRoot === "S",
    acciones: (funcionalidad.acciones ?? []).map((a: any) => ({
      AccionId: a.id,
      ObjetoId: a.id,
    })),
  };

  return (
    <div className="container mx-auto py-6">
      <FuncionalidadForm
        mode="edit"
        initialData={initialData}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  );
}
