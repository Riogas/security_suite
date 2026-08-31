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
import { BotonRoot } from "@/components/ui/solo-root";
import { toast } from "sonner";
import {
  apiAprobarSolicitud,
  apiRechazarSolicitud,
  type SolicitudPermisoItem,
} from "@/services/api";

/*
 * Este modal ya NO lista todas las funcionalidades del sistema.
 *
 * Dos razones, y las dos son el mismo cambio:
 *
 *   1. El servidor dejó de aceptar el `funcionalidadId` del body como una orden.
 *      La aprobación otorga lo que la solicitud PIDIÓ: el conjunto otorgable lo
 *      calcula `POST /solicitudes/:id/aprobar` a partir del objeto y la acción
 *      de la solicitud. Un selector con las 100 funcionalidades del ecosistema
 *      ofrecía exactamente lo que el servidor ahora rechaza — y era el agujero:
 *      un aprobador se creaba una solicitud a sí mismo y elegía la que quisiera.
 *   2. `GET /api/db/funcionalidades` pasó a nivel ADMIN sobre el objeto
 *      `funcionalidades`. Un aprobador que tiene la funcionalidad de aprobar
 *      pero no la de administrar funcionalidades come un 403 al abrir el modal.
 *
 * Lo que se muestra ahora son las CANDIDATAS, que ya vienen en la solicitud
 * (`GET /solicitudes` las calcula con el mismo criterio que usa la aprobación).
 * Si hay una sola —el caso normal— ni se elige: se informa cuál se va a otorgar.
 */

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
  const [funcionalidadId, setFuncionalidadId] = useState<string>("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [comentario, setComentario] = useState("");
  const [loading, setLoading] = useState(false);
  const [accion, setAccion] = useState<null | "aprobar" | "rechazar">(null);

  useEffect(() => {
    if (!isOpen) return;
    setFuncionalidadId("");
    setFechaDesde("");
    setFechaHasta("");
    setComentario("");
  }, [isOpen, solicitud?.id]);

  const candidatas = useMemo(
    () => solicitud?.funcionalidadesCandidatas ?? [],
    [solicitud?.funcionalidadesCandidatas],
  );

  // Con una sola candidata no hay nada que elegir: el servidor la resuelve solo
  // y el body ni se mira. Se preselecciona igual para que el request viaje
  // completo y para que la pantalla diga qué se va a otorgar.
  useEffect(() => {
    if (candidatas.length === 1) setFuncionalidadId(String(candidatas[0].id));
  }, [solicitud?.id, candidatas]);

  if (!solicitud) return null;

  const aprobar = async () => {
    const fid = Number(funcionalidadId);
    if (candidatas.length === 0) {
      toast.error(
        "No hay ninguna funcionalidad vinculada a este objeto: un root tiene que vincularla antes",
      );
      return;
    }
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
              {/* Aprobar y rechazar son nivel ADMIN sobre el objeto
                  `solicitudes` + acción `approve`: root, o quien tenga otorgada
                  la funcionalidad de aprobación. El alcance es "solicitudes" y
                  NO "ROOT" — el flujo existe justamente para que apruebe alguien
                  que no es root. */}
              <BotonRoot
                alcance="solicitudes"
                variant="destructive"
                onClick={rechazar}
                disabled={loading}
              >
                {loading && accion === "rechazar" ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <X className="w-4 h-4 mr-2" aria-hidden="true" />
                )}
                Rechazar
              </BotonRoot>
              {/* Sin candidatas no hay nada que otorgar: el servidor contesta
                  409 y la persona no puede hacer nada al respecto desde acá.
                  Rechazar sí queda habilitado. */}
              <BotonRoot
                alcance="solicitudes"
                onClick={aprobar}
                disabled={loading || candidatas.length === 0}
              >
                {loading && accion === "aprobar" ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="w-4 h-4 mr-2" aria-hidden="true" />
                )}
                Aprobar
              </BotonRoot>
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
            {/* Funcionalidad a otorgar: SOLO las candidatas de esta solicitud */}
            <div className="space-y-2">
              <Label>Funcionalidad a otorgar</Label>

              {candidatas.length === 0 ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  El objeto de esta solicitud no está vinculado a ninguna funcionalidad
                  activa, así que no hay nada que otorgar. Un root tiene que vincularlo
                  primero (Funcionalidades → acciones) y después se puede aprobar. Antes
                  el vínculo se creaba desde acá, y eso permitía otorgar cualquier
                  funcionalidad del sistema.
                </p>
              ) : candidatas.length === 1 ? (
                <>
                  {/* Nada que elegir: el servidor la resuelve de la solicitud. */}
                  <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium">
                    {candidatas[0].nombre}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Es la funcionalidad que protege lo que se pidió. Aprobar otorga
                    exactamente esto.
                  </p>
                </>
              ) : (
                <>
                  <Select value={funcionalidadId} onValueChange={setFuncionalidadId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Elegí una funcionalidad…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[40vh]">
                      {candidatas.map((f) => (
                        <SelectItem key={f.id} value={String(f.id)}>
                          {f.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Hay más de una funcionalidad que otorga lo que se pidió. Solo se puede
                    conceder una de estas.
                  </p>
                </>
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
