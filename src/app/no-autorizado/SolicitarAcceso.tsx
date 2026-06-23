"use client";

import { useState } from "react";
import { Send, Check, Loader2 } from "lucide-react";
import { apiCrearSolicitud } from "@/services/api";

interface SolicitarAccesoProps {
  /** pathname completo, ej "/dashboard/clientes" */
  ruta: string;
  /** nombre amigable de la pantalla */
  nombre: string;
  /** código de pantalla XXXX-XXXX */
  code: string;
}

// Deriva el ObjetoKey (último segmento) y el ObjetoPath (sin /dashboard)
function deriveObjeto(ruta: string): { objetoKey: string; objetoPath: string } {
  const parts = ruta.split("/").filter(Boolean);
  const objetoKey = parts.length > 0 ? parts[parts.length - 1] : "root";
  const prefix = "/dashboard";
  const objetoPath = ruta.startsWith(prefix) ? ruta.slice(prefix.length) || "/" : ruta || "/";
  return { objetoKey, objetoPath };
}

export default function SolicitarAcceso({ ruta, nombre, code }: SolicitarAccesoProps) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "reused" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const enviar = async () => {
    if (!ruta) {
      setEstado("error");
      setErrorMsg("No se pudo determinar la pantalla solicitada.");
      return;
    }
    const { objetoKey, objetoPath } = deriveObjeto(ruta);
    try {
      setEstado("enviando");
      const appId = Number(process.env.NEXT_PUBLIC_APLICACION_ID) || undefined;
      const res = await apiCrearSolicitud({
        AplicacionId: appId,
        ObjetoKey: objetoKey,
        ObjetoTipo: "PAGE",
        AccionKey: "view",
        AccionCodigo: code || undefined,
        ObjetoPath: objetoPath,
        Motivo: motivo.trim() || undefined,
      });
      setEstado(res?.reused ? "reused" : "ok");
    } catch (e: unknown) {
      setEstado("error");
      setErrorMsg(e instanceof Error ? e.message : "No se pudo enviar la solicitud.");
    }
  };

  if (estado === "ok" || estado === "reused") {
    return (
      <div className="w-full rounded-xl border bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
        <Check className="w-5 h-5 shrink-0" aria-hidden="true" />
        <span>
          {estado === "reused"
            ? "Ya tenías una solicitud pendiente para esta pantalla. Un administrador la revisará."
            : "Solicitud enviada. Un administrador la revisará y te dará acceso si corresponde."}
        </span>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex-1 px-5 py-2 rounded-lg bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 transition text-center"
      >
        Solicitar acceso
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border bg-muted/40 p-4 text-sm space-y-3">
      <div className="font-semibold text-foreground">
        Solicitar acceso a {nombre || ruta}
      </div>
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="Motivo (opcional): ¿para qué necesitás esta pantalla?"
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {estado === "error" && (
        <div className="text-destructive text-xs">{errorMsg}</div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={enviar}
          disabled={estado === "enviando"}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition disabled:opacity-60"
        >
          {estado === "enviando" ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="w-4 h-4" aria-hidden="true" />
          )}
          Enviar solicitud
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={estado === "enviando"}
          className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 transition"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
