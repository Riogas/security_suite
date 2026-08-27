"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

// =====================================================================
// Bloque de código con botón "Copiar".
//
// `navigator.clipboard` no existe en contexto inseguro (http:// que no sea
// localhost) — y secapi-dev se sirve por http. Por eso hay fallback al
// `textarea` + `execCommand`: sin él, el botón no haría nada justo en el
// ambiente donde más se prueba.
// =====================================================================

async function copiar(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // sigue por el fallback
  }
  try {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function BotonCopiar({
  texto,
  etiqueta = "Copiar",
  className,
}: {
  texto: string;
  etiqueta?: string;
  className?: string;
}) {
  const [estado, setEstado] = React.useState<"listo" | "copiado" | "error">("listo");

  React.useEffect(() => {
    if (estado === "listo") return;
    const t = setTimeout(() => setEstado("listo"), 1800);
    return () => clearTimeout(t);
  }, [estado]);

  return (
    <button
      type="button"
      onClick={async () => setEstado((await copiar(texto)) ? "copiado" : "error")}
      aria-label={etiqueta}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-2 py-1",
        "text-xs font-medium text-muted-foreground backdrop-blur",
        "transition-colors hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {estado === "copiado" ? (
        <Check className="size-3.5 text-success" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      {estado === "copiado" ? "Copiado" : estado === "error" ? "No se pudo" : etiqueta}
    </button>
  );
}

export function BloqueCodigo({
  codigo,
  titulo,
  className,
  maxAlturaClase = "max-h-96",
}: {
  codigo: string;
  titulo?: string;
  className?: string;
  maxAlturaClase?: string;
}) {
  return (
    <div className={cn("group relative overflow-hidden rounded-lg border bg-muted/40", className)}>
      {titulo && (
        <div className="flex items-center justify-between border-b bg-muted/60 px-3 py-1.5">
          <span className="text-xs font-medium text-muted-foreground">{titulo}</span>
        </div>
      )}
      <div className="absolute right-2 top-2 z-10">
        <BotonCopiar texto={codigo} />
      </div>
      {/* overflow-x propio: el body de la página nunca scrollea de costado */}
      <pre
        className={cn(
          "overflow-x-auto px-3 py-3 pr-24 text-xs leading-relaxed",
          maxAlturaClase,
          "overflow-y-auto",
        )}
      >
        <code className="font-mono">{codigo}</code>
      </pre>
    </div>
  );
}
