"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { AuthDoc } from "@/lib/docs/catalogo";

// =====================================================================
// Las dos etiquetas que se repiten en toda la pantalla: el método HTTP y el
// modo de autenticación.
//
// Colores por método con el convenio de siempre (verde lee, azul crea, ámbar
// modifica, rojo borra) y **borde de color, no solo texto**: en una lista de 69
// filas el ojo tiene que separar un DELETE de un GET sin leer.
// =====================================================================

const ESTILO_METODO: Record<string, string> = {
  GET: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  POST: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  PUT: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  PATCH: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  DELETE: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
  HEAD: "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-400",
};

export function EtiquetaMetodo({
  metodo,
  className,
}: {
  metodo: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-[4.25rem] shrink-0 items-center justify-center rounded-md border px-1.5 py-0.5",
        "font-mono text-[11px] font-bold tracking-tight",
        ESTILO_METODO[metodo] ?? "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {metodo}
    </span>
  );
}

/**
 * El badge de autenticación. `SIN AUTH` va en destructive y con el texto en
 * mayúsculas a propósito: es lo primero que un root quiere ver en la lista, no
 * un detalle más.
 */
export function BadgeAuth({ auth, className }: { auth: AuthDoc; className?: string }) {
  const variante =
    auth.tono === "peligro"
      ? "destructive"
      : auth.tono === "advertencia"
        ? "warning"
        : auth.tono === "ok"
          ? "success"
          : "secondary";

  return (
    <Badge
      variant={variante}
      title={auth.detalle}
      className={cn("text-[10px] font-semibold", className)}
    >
      {auth.etiqueta}
    </Badge>
  );
}
