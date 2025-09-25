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
      if (!id) {
        console.warn("[EditarObjeto] No hay id en params", { params });
        return;
      }
      try {
        const appId = Number(process.env.NEXT_PUBLIC_APLICACION_ID) || 1;
        const payload = { AplicacionId: appId, Page: 1, PageSize: 500, sinMenu: true } as any;
        console.log("[EditarObjeto] Llamando listarObjetos", { id, payload });
        // Reutilizamos listar para obtener el objeto por ID
        const res = await apiListarObjetos(payload);
        const lista = (res as any)?.sdtListaObjetos || [];
        console.log("[EditarObjeto] Resultado listarObjetos", {
          count: lista.length,
          idsSample: lista.slice(0, 20).map((o: any) => String(o?.ObjetoId)),
          keysSample: lista.slice(0, 20).map((o: any) => String(o?.ObjetoKey)),
        });
        const obj = lista.find((o: any) => String(o?.ObjetoId) === String(id));
        if (!obj) {
          console.warn("[EditarObjeto] Objeto no encontrado en la lista", { id });
          return;
        }
        console.log("[EditarObjeto] Objeto encontrado", { ObjetoId: obj.ObjetoId, ObjetoKey: obj.ObjetoKey });
        const data = {
          objetoid: String(obj.ObjetoId),
          aplicacionid: String(obj.AplicacionId),
          objetotipo: obj.ObjetoTipo,
          objetokey: obj.ObjetoKey,
          objetoestado: obj.ObjetoEstado as any,
          objetoespublico: obj.ObjetoEsPublico === "S",
          objetocreadoen: obj.ObjetoCreadoEn,
          acciones: (obj.Acciones || []).map((a: any) => ({
            uid: (typeof crypto !== "undefined" && (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).slice(2)),
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
