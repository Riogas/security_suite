"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck } from "lucide-react";
import { apiRolesUsuarioDB } from "@/services/api";

interface UsuarioRolItem {
  usuarioId: number;
  rolId: number;
  fechaDesde: string | null;
  fechaHasta: string | null;
  rol?: {
    id: number;
    nombre: string;
    descripcion: string | null;
    estado: string;
    nivel: number | null;
    aplicacionId: number;
    aplicacion?: { nombre: string } | null;
  };
}

interface VerPermisosModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: number;
  userName: string;
}

function estadoLabel(estado: string): { label: string; active: boolean } {
  const s = (estado || "").trim().toUpperCase();
  if (s === "A") return { label: "Activo", active: true };
  return { label: "Inactivo", active: false };
}

export default function VerPermisosModal({
  isOpen,
  onClose,
  userId,
  userName,
}: VerPermisosModalProps) {
  const [roles, setRoles] = useState<UsuarioRolItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setLoading(true);
    apiRolesUsuarioDB(userId)
      .then((res: any) => {
        setRoles(res?.roles ?? []);
      })
      .catch(() => setError("Error al cargar los roles del usuario"))
      .finally(() => setLoading(false));
  }, [isOpen, userId]);

  function formatFecha(f: string | null) {
    if (!f) return null;
    try {
      return new Date(f).toLocaleDateString("es-UY");
    } catch {
      return f;
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            Permisos de {userName}
          </DialogTitle>
          <DialogDescription>
            Roles asignados al usuario (solo lectura). Para modificar, use la
            opción &quot;Editar usuario&quot;.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-red-400 text-sm py-4 text-center">{error}</p>
        ) : roles.length === 0 ? (
          <p className="text-muted-foreground text-sm py-6 text-center">
            Este usuario no tiene roles asignados.
          </p>
        ) : (
          <div className="space-y-3 mt-2">
            {roles.map((ur) => {
              const { label, active } = estadoLabel(ur.rol?.estado ?? "I");
              return (
                <div
                  key={ur.rolId}
                  className="border rounded-lg p-4 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-semibold text-sm">
                      {ur.rol?.nombre ?? `Rol #${ur.rolId}`}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          active
                            ? "bg-green-900 text-green-200"
                            : "bg-red-900 text-red-200"
                        }
                      >
                        {label}
                      </Badge>
                      {ur.rol?.nivel != null && (
                        <Badge variant="secondary">Nivel {ur.rol.nivel}</Badge>
                      )}
                    </div>
                  </div>

                  {ur.rol?.descripcion && (
                    <p className="text-sm text-muted-foreground">
                      {ur.rol.descripcion}
                    </p>
                  )}

                  {ur.rol?.aplicacion?.nombre && (
                    <p className="text-xs text-muted-foreground">
                      Aplicación: {ur.rol.aplicacion.nombre}
                    </p>
                  )}

                  {(ur.fechaDesde || ur.fechaHasta) && (
                    <p className="text-xs text-muted-foreground">
                      Vigencia:{" "}
                      {ur.fechaDesde ? formatFecha(ur.fechaDesde) : "sin inicio"}{" "}
                      →{" "}
                      {ur.fechaHasta ? formatFecha(ur.fechaHasta) : "sin vencimiento"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
