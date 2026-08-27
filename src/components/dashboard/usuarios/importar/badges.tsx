import React from "react";
import { Badge } from "@/components/ui/badge";
import type { EstadoComparacionUI, OrigenExternoUI } from "@/services/api";

const ORIGEN_ESTILO: Record<string, { label: string; className: string }> = {
  SGM: { label: "SGM", className: "border-amber-500 text-amber-400" },
  LDAP: { label: "LDAP", className: "border-sky-500 text-sky-400" },
  GSIST: { label: "GSIST", className: "border-violet-500 text-violet-400" },
};

const ESTILO_LOCAL = { label: "Local", className: "border-blue-500 text-blue-400" };

export function BadgeOrigen({ origen }: { origen: OrigenExternoUI | string | null }) {
  const key = (origen || "").trim().toUpperCase();
  // `desdeSistema` la escriben dos caminos con semánticas distintas: el login
  // externo (SGM/LDAP/GSIST) y el switch "Desde Sistema" de UsuarioForm, que
  // escribe "S"/"N" (un booleano, no un origen). Cualquier valor que no sea
  // uno de los tres orígenes externos conocidos —"LOCAL", "S", "N", vacío,
  // null o basura inesperada— significa "no hay origen externo registrado",
  // así que se muestra como usuario Local. No es un bug, es la lectura correcta.
  const estilo = ORIGEN_ESTILO[key] ?? ESTILO_LOCAL;
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
