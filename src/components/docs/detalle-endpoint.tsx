"use client";

import * as React from "react";
import { AlertTriangle, FileCode2, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EndpointDoc } from "@/lib/docs/catalogo";
import { BloqueCodigo } from "@/components/docs/bloque-codigo";
import { Probador } from "@/components/docs/probador";
import { useAmbiente } from "@/components/docs/usar-ambiente";
import { TextoRico } from "@/components/docs/texto-rico";
import {
  conOrigen,
  datosDeEndpoint,
  ejemploCurl,
  ejemploFetch,
  ejemploVb6,
  sustituirParametros,
  tieneConsumidorVb6,
  valorDeMuestra,
} from "@/components/docs/ejemplos";

// =====================================================================
// El detalle de un endpoint: todo lo que hay que saber para consumirlo y el
// formulario para probarlo, en el orden en que se necesita.
//
// Nada de markdown renderizado: las descripciones se rearman en párrafos (ver
// `enParrafos`) y el único formato inline que se interpreta es `código` y
// **negrita** (`TextoRico`). Meter un renderer de markdown completo sería sumar
// una dependencia y una superficie de HTML crudo a una pantalla que ya publica
// información sensible.
// =====================================================================

/**
 * Las descripciones vienen de bloques `|` del YAML, o sea con los saltos de
 * línea del archivo adentro. Pintarlas con `whitespace-pre-line` deja una
 * columna angosta y desprolija de ~80 caracteres, sin relación con el ancho de
 * la pantalla.
 *
 * Acá se rearman los párrafos: la línea en blanco separa, el salto simple se
 * vuelve un espacio y el texto fluye. Los renglones que empiezan con viñeta o
 * que vienen indentados (un bloque de código pegado en la descripción) se
 * respetan tal cual: ahí el salto sí significa algo.
 */
function enParrafos(texto: string): string[][] {
  return texto
    .trim()
    .split(/\n[ \t]*\n/)
    .map((parrafo) => {
      const renglones: string[] = [];
      for (const linea of parrafo.split("\n")) {
        const esListaOCodigo = /^\s{2,}\S/.test(linea) || /^\s*[-*·]\s/.test(linea);
        if (esListaOCodigo || renglones.length === 0) renglones.push(linea);
        else renglones[renglones.length - 1] = `${renglones[renglones.length - 1]} ${linea.trim()}`;
      }
      return renglones;
    });
}

function TextoLargo({ texto, className }: { texto: string; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {enParrafos(texto).map((renglones, i) => (
        <p key={i} className="whitespace-pre-line text-sm leading-relaxed">
          <TextoRico texto={renglones.join("\n")} />
        </p>
      ))}
    </div>
  );
}

function Seccion({
  titulo,
  children,
  className,
}: {
  titulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </h4>
      {children}
    </section>
  );
}

export function DetalleEndpoint({ endpoint }: { endpoint: EndpointDoc }) {
  const { origen, montado } = useAmbiente();

  // Hasta que monta no hay origen: se muestra el marcador en vez de un host
  // inventado que después cambia y descoloca a quien ya lo copió.
  const origenEjemplo = montado ? origen : "{{ORIGEN}}";

  const valoresMuestra = Object.fromEntries(
    endpoint.parametros.filter((p) => p.lugar === "path").map((p) => [p.nombre, valorDeMuestra(p)]),
  );
  const pathEjemplo = sustituirParametros(endpoint.ruta, valoresMuestra);
  const datos = datosDeEndpoint(endpoint, origenEjemplo, pathEjemplo, endpoint.cuerpo?.ejemplo);

  const generados = [
    { clave: "curl", etiqueta: "curl", codigo: ejemploCurl(datos) },
    { clave: "fetch", etiqueta: "fetch (JS)", codigo: ejemploFetch(datos) },
    ...(tieneConsumidorVb6(endpoint)
      ? [{ clave: "vb6", etiqueta: "VB6", codigo: ejemploVb6(datos) }]
      : []),
  ];

  const anotados = endpoint.ejemplos.map((e, i) => ({
    clave: `anotado-${i}`,
    etiqueta: e.titulo ?? e.lenguaje,
    codigo: conOrigen(e.codigo, origenEjemplo),
  }));

  const pestanas = [...generados, ...anotados];

  return (
    <div className="space-y-6">
      {endpoint.descripcion && endpoint.descripcion !== endpoint.summary && (
        <TextoLargo texto={endpoint.descripcion} className="text-foreground/90" />
      )}

      {endpoint.consumidores.length > 0 && (
        <Seccion titulo="Quién lo consume">
          <ul className="space-y-1.5">
            {endpoint.consumidores.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Users className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <TextoRico texto={c} />
                </span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {endpoint.notas.length > 0 && (
        <Seccion titulo="Hay que saber">
          <ul className="space-y-2">
            {endpoint.notas.map((n, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-sm"
              >
                <AlertTriangle
                  className="mt-0.5 size-3.5 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <TextoRico texto={n} />
                </span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {/* ── Parámetros ── */}
      {endpoint.parametros.length > 0 && (
        <Seccion titulo="Parámetros">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Nombre</th>
                  <th className="px-3 py-2 text-left font-medium">En</th>
                  <th className="px-3 py-2 text-left font-medium">Tipo</th>
                  <th className="px-3 py-2 text-left font-medium">Req.</th>
                  <th className="px-3 py-2 text-left font-medium">Descripción</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {endpoint.parametros.map((p) => (
                  <tr key={`${p.lugar}-${p.nombre}`}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-medium">
                      {p.nombre}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {p.lugar}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                      {p.tipo}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {p.requerido ? (
                        <span className="font-semibold text-destructive">sí</span>
                      ) : (
                        <span className="text-muted-foreground">no</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {p.descripcion ? <TextoRico texto={p.descripcion} /> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}

      {/* ── Cuerpo ── */}
      {endpoint.cuerpo && (
        <Seccion titulo="Cuerpo del request">
          <div className="space-y-3">
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="font-mono text-[10px]">
                {endpoint.cuerpo.contentType}
              </Badge>
              {endpoint.cuerpo.requerido && (
                <Badge variant="secondary" className="text-[10px]">
                  requerido
                </Badge>
              )}
              {endpoint.cuerpo.descripcion && (
                <span>
                  <TextoRico texto={endpoint.cuerpo.descripcion} />
                </span>
              )}
            </p>

            {endpoint.cuerpo.campos.length > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[30rem] text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Campo</th>
                      <th className="px-3 py-2 text-left font-medium">Tipo</th>
                      <th className="px-3 py-2 text-left font-medium">Req.</th>
                      <th className="px-3 py-2 text-left font-medium">Descripción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {endpoint.cuerpo.campos.map((c) => (
                      <tr key={c.nombre}>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-medium">
                          {c.nombre}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                          {c.tipo ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">
                          {c.requerido ? (
                            <span className="font-semibold text-destructive">sí</span>
                          ) : (
                            <span className="text-muted-foreground">no</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {c.descripcion ? <TextoRico texto={c.descripcion} /> : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {endpoint.cuerpo.ejemplo && (
              <BloqueCodigo codigo={endpoint.cuerpo.ejemplo} titulo="Ejemplo" />
            )}
            {endpoint.cuerpo.schema && !endpoint.cuerpo.ejemplo && (
              <BloqueCodigo codigo={endpoint.cuerpo.schema} titulo="Schema" />
            )}
          </div>
        </Seccion>
      )}

      {/* ── Respuestas ── */}
      {endpoint.respuestas.length > 0 && (
        <Seccion titulo="Respuestas">
          <div className="divide-y rounded-lg border">
            {endpoint.respuestas.map((r) => (
              <div key={r.codigo} className="p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span
                    className={cn(
                      "font-mono text-sm font-bold",
                      r.codigo === "default"
                        ? "text-muted-foreground"
                        : r.esError
                          ? "text-destructive"
                          : "text-success",
                    )}
                  >
                    {r.codigo}
                  </span>
                  <TextoLargo
                    texto={r.descripcion}
                    className="min-w-0 text-muted-foreground [&_p]:leading-snug"
                  />
                </div>
                {r.ejemplo && <BloqueCodigo codigo={r.ejemplo} className="mt-2" />}
              </div>
            ))}
          </div>
        </Seccion>
      )}

      {/* ── Errores conocidos ── */}
      {endpoint.errores.length > 0 && (
        <Seccion titulo="Errores conocidos">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[26rem] text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Código</th>
                  <th className="px-3 py-2 text-left font-medium">Cuándo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {endpoint.errores.map((e, i) => (
                  <tr key={`${e.status ?? ""}-${e.code ?? ""}-${i}`}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold text-destructive">
                      {e.status ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                      {e.code ?? "—"}
                    </td>
                    <td className="whitespace-pre-line px-3 py-2 text-xs text-muted-foreground">
                      {e.cuando ? <TextoRico texto={e.cuando} /> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}

      {/* ── Ejemplos ── */}
      <Seccion titulo="Ejemplos">
        <Tabs defaultValue={pestanas[0]?.clave}>
          <TabsList className="flex-wrap">
            {pestanas.map((p) => (
              <TabsTrigger key={p.clave} value={p.clave} className="text-xs">
                {p.etiqueta}
              </TabsTrigger>
            ))}
          </TabsList>
          {pestanas.map((p) => (
            <TabsContent key={p.clave} value={p.clave} className="mt-3">
              <BloqueCodigo codigo={p.codigo} />
            </TabsContent>
          ))}
        </Tabs>
        <p className="text-xs text-muted-foreground">
          El host sale del ambiente en el que estás parado
          {montado && <span className="font-mono"> ({origen})</span>}, no de una constante.
        </p>
      </Seccion>

      {/* ── Try it ── */}
      <Seccion titulo="Probar">
        <Probador endpoint={endpoint} />
      </Seccion>

      {endpoint.archivo && (
        <p className="flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
          <FileCode2 className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-all font-mono">{endpoint.archivo}</span>
        </p>
      )}
    </div>
  );
}
