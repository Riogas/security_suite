"use client";

import ObjetoForm from "@/components/dashboard/objetos/form/ObjetoForm";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiObjetoDBById } from "@/services/api";

export default function EditarObjetoPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params?.id[0] : (params?.id as string);
  const [loading, setLoading] = useState(true);
  const [initialData, setInitialData] = useState<any | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!id) return;
      try {
        const res = await apiObjetoDBById(parseInt(id));
        const obj = res?.objeto;
        if (!obj) {
          console.warn("[EditarObjeto] Objeto no encontrado", { id });
          return;
        }

        const data = {
          objetoid: String(obj.id),
          aplicacionid: String(obj.aplicacionId),
          objetotipo: obj.tipo as any,
          objetokey: obj.key ?? "",
          objetoestado: obj.estado as any,
          objetoespublico: obj.esPublico === "S",
          objetocreadoen: obj.creadoEn ?? "",
          acciones: (obj.acciones || []).map((a: any) => ({
            uid: crypto.randomUUID(),
            accionid: String(a.id),
            accionkey: a.key ?? "",
            acciondescripcion: a.descripcion ?? "",
            accioncreadoen: a.creadoEn ?? "",
            accioncodigo: a.codigo ?? "",
            accionlabel: a.label ?? "",
            accionpath: a.path ?? "",
            accionicon: a.icon ?? "",
            accionrelacion: a.relacion ? String(a.relacion) : "",
          })),
        };
        if (mounted) setInitialData(data);
      } catch (e) {
        console.error("[EditarObjeto] Error al cargar el objeto", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  if (loading) return <div className="p-4">Cargando...</div>;
  if (!initialData) return <div className="p-4">No se encontró el objeto</div>;

  return <ObjetoForm initialData={initialData} />;
}
