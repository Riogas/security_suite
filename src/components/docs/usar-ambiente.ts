"use client";

import * as React from "react";
import { ambienteDeHost, type Ambiente } from "@/lib/docs/ambiente";

// =====================================================================
// El origen y el ambiente reales, leídos del navegador.
//
// Se resuelven después del montaje y no durante el render del servidor: en el
// server no hay `window`, y devolver algo distinto en el primer render del
// cliente sería un mismatch de hidratación. Hasta que monta, `montado` es
// false y la UI muestra el estado neutro en vez de adivinar.
//
// Es a propósito que esto NO venga del servidor: el ejemplo que alguien copia
// y el "Try it" que dispara tienen que apuntar al host que tiene delante.
// =====================================================================

export interface ContextoAmbiente {
  /** `https://secapi-dev.riogas.com.uy` — vacío hasta que monta. */
  origen: string;
  host: string;
  ambiente: Ambiente;
  montado: boolean;
}

export function useAmbiente(): ContextoAmbiente {
  const [estado, setEstado] = React.useState<ContextoAmbiente>({
    origen: "",
    host: "",
    ambiente: "PROD",
    montado: false,
  });

  React.useEffect(() => {
    const host = window.location.host;
    setEstado({
      origen: window.location.origin,
      host,
      ambiente: ambienteDeHost(host),
      montado: true,
    });
  }, []);

  return estado;
}
