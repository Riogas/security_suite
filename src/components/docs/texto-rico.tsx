"use client";

import * as React from "react";

// =====================================================================
// El mínimo formato inline que necesitan las anotaciones: `código` y
// **negrita**, y `código` adentro de **negrita**.
//
// No es un renderer de markdown y no quiere serlo. Es que las anotaciones se
// escriben a mano en YAML y ahí los backticks salen solos —`x-api-key`,
// `es_root='S'`— y dejarlos crudos en pantalla se ve peor que no tenerlos.
// Con dos marcas alcanza para que el texto se lea, y a cambio no se suma una
// dependencia ni una superficie de HTML crudo a una pantalla que publica
// justamente qué endpoints están sin autenticación.
//
// Se construyen elementos de React: **nunca** `dangerouslySetInnerHTML`.
// =====================================================================

const RE_NEGRITA = /(\*\*[^\n]+?\*\*)/g;
const RE_CODIGO = /(`[^`\n]+`)/g;

function Codigo({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.92em] text-foreground">
      {children}
    </code>
  );
}

/** El nivel de adentro: solo `código`. No recurre, así que no hay ciclo. */
function conCodigo(texto: string, prefijo: string): React.ReactNode[] {
  return texto.split(RE_CODIGO).map((parte, i) => {
    if (parte.length > 2 && parte.startsWith("`") && parte.endsWith("`")) {
      return <Codigo key={`${prefijo}-c${i}`}>{parte.slice(1, -1)}</Codigo>;
    }
    return <React.Fragment key={`${prefijo}-t${i}`}>{parte}</React.Fragment>;
  });
}

export function TextoRico({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(RE_NEGRITA).map((parte, i) => {
        if (parte.length > 4 && parte.startsWith("**") && parte.endsWith("**")) {
          return (
            <strong key={`n${i}`} className="font-semibold">
              {conCodigo(parte.slice(2, -2), `n${i}`)}
            </strong>
          );
        }
        return <React.Fragment key={`p${i}`}>{conCodigo(parte, `p${i}`)}</React.Fragment>;
      })}
    </>
  );
}
