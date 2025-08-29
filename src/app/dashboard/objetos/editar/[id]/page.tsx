"use client";

import ObjetoForm from "@/components/dashboard/objetos/form/ObjetoForm";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiListarObjetos } from "@/services/api";

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
        // Reutilizamos listar para obtener el objeto por ID
        const res = await apiListarObjetos({ AplicacionId: 1 });
        const obj = res.sdtListaObjetos?.find((o) => String(o.ObjetoId) === String(id));
        if (!obj) return;
        const data = {
          objetoid: String(obj.ObjetoId),
          aplicacionid: String(obj.AplicacionId),
          objetotipo: obj.ObjetoTipo,
          objetokey: obj.ObjetoKey,
          objetoestado: obj.ObjetoEstado as any,
          objetoespublico: obj.ObjetoEsPublico === "S",
          objetocreadoen: obj.ObjetoCreadoEn,
          acciones: (obj.Acciones || []).map((a) => ({
            uid: crypto.randomUUID(),
            accionid: String(a.AccionId),
            accionkey: a.AccionKey,
            acciondescripcion: a.AccionDescripcion,
            accioncreadoen: a.AccionCreadoEn,
            accioncodigo: a.AccionCodigo,
            accionlabel: a.AccionLabel,
            accionpath: a.AccionPath,
            accionicon: a.AccionIcon,
            accionrelacion: String(a.AccionRelacion || ""),
          })),
        };
        if (mounted) setInitialData(data);
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
