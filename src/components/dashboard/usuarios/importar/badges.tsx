import React from "react";
import { Badge } from "@/components/ui/badge";
import type { EstadoComparacionUI, OrigenExternoUI } from "@/services/api";

const ORIGEN_ESTILO: Record<string, { label: string; className: string }> = {
  SGM: { label: "SGM", className: "border-amber-500 text-amber-400" },
  LDAP: { label: "LDAP", className: "border-sky-500 text-sky-400" },
  GSIST: { label: "GSIST", className: "border-violet-500 text-violet-400" },
  LOCAL: { label: "Local", className: "border-blue-500 text-blue-400" },
};

export function BadgeOrigen({ origen }: { origen: OrigenExternoUI | string | null }) {
  const key = (origen || "").trim().toUpperCase();
  const estilo = ORIGEN_ESTILO[key];
  // Los 9 registros con desdeSistema en "N"/"S" (bug viejo del sync) caen acá.
  if (!estilo) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={estilo.className}>
      {estilo.label}
    </Badge>
  );
}

const COMPARACION_ESTILO: Record<EstadoComparacionUI, { label: string; variant: "success" | "secondary" | "outline" | "destructive"; className?: string }> = {
  NUEVO: { label: "Nuevo", variant: "success" },
  MIGRADO: { label: "Migrado", variant: "secondary" },
  DIFIERE: { label: "Difiere", variant: "outline", className: "border-amber-500 text-amber-400" },
  CONFLICTO: { label: "Conflicto", variant: "destructive" },
};

export function BadgeComparacion({ estado }: { estado: EstadoComparacionUI }) {
  const e = COMPARACION_ESTILO[estado];
  return (
    <Badge variant={e.variant} className={e.className}>
      {e.label}
    </Badge>
  );
}
