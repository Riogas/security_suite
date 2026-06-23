"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  apiFuncionalidadesDB,
  apiAprobarSolicitud,
  apiRechazarSolicitud,
  type SolicitudPermisoItem,
  type FuncionalidadDB,
} from "@/services/api";

interface RevisarSolicitudModalProps {
  isOpen: boolean;
  onClose: () => void;
  solicitud: SolicitudPermisoItem | null;
  onResuelta: () => void;
}

function nombreUsuario(s: SolicitudPermisoItem): string {
  const u = s.usuario;
  if (!u) return `#${s.usuarioId}`;
  const full = [u.nombre, u.apellido].filter(Boolean).join(" ").trim();
  return full || u.username || u.email || `#${s.usuarioId}`;
}

export default function RevisarSolicitudModal({
  isOpen,
  onClose,
  solicitud,
  onResuelta,
}: RevisarSolicitudModalProps) {
  const [funcionalidades, setFuncionalidades] = useState<FuncionalidadDB[]>([]);
  const [funcionalidadId, setFuncionalidadId] = useState<string>("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [comentario, setComentario] = useState("");
  const [loading, setLoading] = useState(false);
  const [accion, setAccion] = useState<null | "aprobar" | "rechazar">(null);

  // Cargar funcionalidades activas al abrir
  useEffect(() => {
    if (!isOpen) return;
    setFuncionalidadId("");
    setFechaDesde("");
    setFechaHasta("");
    setComentario("");
    (async () => {
      try {
        const res = await apiFuncionalidadesDB({ estado: "A", pageSize: 1000 });
        setFuncionalidades(res?.items ?? []);
      } catch (e) {
        console.error("[RevisarSolicitudModal] funcionalidades:", e);
      }
    })();
  }, [isOpen, solicitud?.id]);

  // Pre-seleccionar candidata si hay una sola
  useEffect(() => {
    const cand = solicitud?.funcionalidadesCandidatas;
    if (cand && cand.length === 1) setFuncionalidadId(String(cand[0].id));
  }, [solicitud?.id, solicitud?.funcionalidadesCandidatas]);

  const candidatasIds = useMemo(
    () => new Set((solicitud?.funcionalidadesCandidatas ?? []).map((c) => c.id)),
    [solicitud?.funcionalidadesCandidatas],
  );

  if (!solicitud) return null;

  const aprobar = async () => {
    const fid = Number(funcionalidadId);
    if (!fid) {
      toast.error("Elegí la funcionalidad a otorgar");
      return;
    }
    if (fechaDesde && fechaHasta && new Date(fechaDesde) > new Date(fechaHasta)) {
      toast.error("La fecha desde debe ser anterior a la fecha hasta");
      return;
    }
    try {
      setLoading(true);
      setAccion("aprobar");
      await apiAprobarSolicitud(solicitud.id, {
        funcionalidadId: fid,
        fechaDesde: fechaDesde || null,
        fechaHasta: fechaHasta || null,
        comentario: comentario.trim() || undefined,
      });
      toast.success("Solicitud aprobada — acceso otorgado");
      onResuelta();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al aprobar");
    } finally {
      setLoading(false);
      setAccion(null);
    }
  };

  const rechazar = async () => {
    try {
      setLoading(true);
      setAccion("rechazar");
      await apiRechazarSolicitud(solicitud.id, { comentario: comentario.trim() || undefined });
      toast.success("Solicitud rechazada");
      onResuelta();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al rechazar");
    } finally {
      setLoading(false);
      setAccion(null);
    }
  };

  const yaResuelta = solicitud.estado !== "PENDIENTE";

  return (
    <ModalShell
      open={isOpen}
      onOpenChange={onClose}
      title="Revisar solicitud de acceso"
      description={`Solicitada por ${nombreUsuario(solicitud)}`}
      icon={ShieldCheck}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cerrar
          </Button>
          {!yaResuelta && (
            <>
              <Button variant="destructive" onClick={rechazar} disabled={loading}>
                {loading && accion === "rechazar" ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <X className="w-4 h-4 mr-2" aria-hidden="true" />
                )}
                Rechazar
              </Button>
              <Button onClick={aprobar} disabled={loading}>
                {loading && accion === "aprobar" ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="w-4 h-4 mr-2" aria-hidden="true" />
                )}
                Aprobar
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {/* Detalle del recurso */}
        <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">
              {solicitud.objeto?.label || solicitud.objeto?.key}
            </span>
            <Badge variant="outline">{solicitud.objeto?.tipo}</Badge>
            <Badge variant="secondary">{solicitud.accionKey}</Badge>
          </div>
          <div className="text-muted-foreground">
            <span>Aplicación:</span>{" "}
            <span className="text-foreground">{solicitud.aplicacion?.nombre ?? solicitud.aplicacionId}</span>
          </div>
          {solicitud.rutaSolicitada && (
            <div className="text-muted-foreground">
              <span>Ruta:</span>{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">{solicitud.rutaSolicitada}</code>
            </div>
          )}
          {solicitud.motivoSolicitud && (
            <div className="text-muted-foreground">
              <span>Motivo:</span>{" "}
              <span className="text-foreground italic">"{solicitud.motivoSolicitud}"</span>
            </div>
          )}
        </div>

        {yaResuelta ? (
          <div className="rounded-lg border p-4 text-sm">
            Esta solicitud ya está <strong>{solicitud.estado}</strong>
            {solicitud.comentarioResolucion ? ` — "${solicitud.comentarioResolucion}"` : ""}.
          </div>
        ) : (
          <>
            {/* Funcionalidad a otorgar */}
            <div className="space-y-2">
              <Label>Funcionalidad a otorgar</Label>
              <Select value={funcionalidadId} onValueChange={setFuncionalidadId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Elegí una funcionalidad…" />
                </SelectTrigger>
                <SelectContent className="max-h-[40vh]">
                  {funcionalidades.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {candidatasIds.has(f.id) ? "★ " : ""}
                      {f.nombre}
                      {f.aplicacion?.nombre ? ` · ${f.aplicacion.nombre}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {solicitud.requiereVinculo ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  El objeto aún no está vinculado a ninguna funcionalidad. Al aprobar, se
                  vincula automáticamente a la que elijas.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  ★ = funcionalidades ya vinculadas a este objeto (recomendadas).
                </p>
              )}
            </div>

            {/* Vigencia opcional */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Desde (opcional)</Label>
                <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Hasta (opcional)</Label>
                <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
              </div>
            </div>

            {/* Comentario */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Comentario (opcional)</Label>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Nota de resolución…"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}
