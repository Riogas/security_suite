"use client";

import ObjetoForm from "@/components/dashboard/objetos/form/ObjetoForm";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFuncionalidadDBById, apiAccionesFuncionalidadDB } from "@/services/api";

export default function EditarObjetoPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params?.id[0] : (params?.id as string);
  const [loading, setLoading] = useState(true);
  const [initialData, setInitialData] = useState<any | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!id) {
        console.warn("[EditarObjeto] No hay id en params", { params });
        return;
      }
      try {
        const [funcRes, accionesRes] = await Promise.all([
          apiFuncionalidadDBById(parseInt(id)),
          apiAccionesFuncionalidadDB(parseInt(id)),
        ]);

        const obj = funcRes?.funcionalidad;
        if (!obj) {
          console.warn("[EditarObjeto] Funcionalidad no encontrada", { id });
          return;
        }

        const data = {
          objetoid: String(obj.id),
          aplicacionid: String(obj.aplicacionId),
          objetotipo: "PAGE",
          objetokey: obj.nombre?.toLowerCase().replace(/\s+/g, "-") ?? "",
          objetoestado: obj.estado as any,
          objetoespublico: obj.esPublico === "S",
          objetocreadoen: "",
          acciones: (accionesRes?.acciones || []).map((a: any) => ({
            uid: crypto.randomUUID(),
            accionid: String(a.id),
            accionkey: a.nombre?.toLowerCase().replace(/\s+/g, "-") ?? "",
            acciondescripcion: a.descripcion ?? "",
            accioncreadoen: "",
            accioncodigo: "",
            accionlabel: a.nombre,
            accionpath: "",
            accionicon: "",
            accionrelacion: "",
          })),
        };
        if (mounted) setInitialData(data);
      } catch (e) {
        console.error("[EditarObjeto] Error al cargar el objeto", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) return <div className="p-4">Cargando...</div>;
  if (!initialData) return <div className="p-4">No se encontró el objeto</div>;

  return <ObjetoForm initialData={initialData} />;
}
