"use client";

import * as React from "react";
import { AlertTriangle, Loader2, Play, ShieldAlert, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { EndpointDoc } from "@/lib/docs/catalogo";
import { BloqueCodigo } from "@/components/docs/bloque-codigo";
import { armarQueryString, sustituirParametros, valorDeMuestra } from "@/components/docs/ejemplos";
import { useAmbiente } from "@/components/docs/usar-ambiente";

// =====================================================================
// "Try it": el formulario que ejecuta una llamada real contra el ambiente en
// el que está parado el portal.
//
// El pedido NO sale del navegador hacia la API: sale hacia `POST /api/docs/try`,
// codificado en base64, y el servidor lo ejecuta con la sesión del root. Dos
// razones: el base64 atraviesa el WAF de nginx (que inspecciona el cuerpo del
// request y rechaza sintaxis de shell), y el token nunca se manipula del lado
// del cliente.
//
// Toda escritura pasa por un diálogo que exige escribir el path exacto, con el
// ambiente bien visible —en rojo si es PROD—. El servidor vuelve a exigir esa
// misma confirmación: el diálogo es la cortesía, el 428 es la regla.
// =====================================================================

const METODOS_DE_ESCRITURA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

interface RespuestaTry {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duracionMs: number;
  truncado: boolean;
}

/** base64 seguro con UTF-8: `btoa` solo acepta latin-1. */
function aBase64(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

/** `Nombre: valor` por línea → objeto. Formato familiar y sin JSON de por medio. */
function parsearHeaders(texto: string): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const linea of texto.split("\n")) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const corte = limpia.indexOf(":");
    if (corte <= 0) continue;
    salida[limpia.slice(0, corte).trim()] = limpia.slice(corte + 1).trim();
  }
  return salida;
}

function esJson(texto: string): boolean {
  try {
    JSON.parse(texto);
    return true;
  } catch {
    return false;
  }
}

function embellecer(texto: string): string {
  try {
    return JSON.stringify(JSON.parse(texto), null, 2);
  } catch {
    return texto;
  }
}

function tonoDeStatus(status: number): string {
  if (status >= 200 && status < 300) return "text-success";
  if (status >= 300 && status < 400) return "text-muted-foreground";
  if (status >= 400 && status < 500) return "text-warning";
  return "text-destructive";
}

export function Probador({ endpoint }: { endpoint: EndpointDoc }) {
  const { origen, host, ambiente, montado } = useAmbiente();
  const escribe = METODOS_DE_ESCRITURA.has(endpoint.metodo);

  const parametrosPath = endpoint.parametros.filter((p) => p.lugar === "path");
  const parametrosQuery = endpoint.parametros.filter((p) => p.lugar === "query");

  const [valoresPath, setValoresPath] = React.useState<Record<string, string>>({});
  const [valoresQuery, setValoresQuery] = React.useState<Record<string, string>>({});
  const [headersTexto, setHeadersTexto] = React.useState("");
  const [cuerpo, setCuerpo] = React.useState(() => endpoint.cuerpo?.ejemplo ?? "");

  const [ejecutando, setEjecutando] = React.useState(false);
  const [respuesta, setRespuesta] = React.useState<RespuestaTry | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [dialogoAbierto, setDialogoAbierto] = React.useState(false);
  const [textoConfirmacion, setTextoConfirmacion] = React.useState("");

  const pathResuelto = sustituirParametros(endpoint.ruta, valoresPath);
  const faltanPath = parametrosPath.filter((p) => !valoresPath[p.nombre]);
  const pathCompleto = `${pathResuelto}${armarQueryString(valoresQuery)}`;
  const confirmacionOk = textoConfirmacion.trim() === pathResuelto;

  async function ejecutar(confirmacion?: string) {
    setEjecutando(true);
    setError(null);
    setRespuesta(null);

    const cuerpoTexto = cuerpo.trim();
    const pedido = {
      metodo: endpoint.metodo,
      path: pathCompleto,
      headers: parsearHeaders(headersTexto),
      body:
        !escribe || cuerpoTexto === ""
          ? undefined
          : esJson(cuerpoTexto)
            ? JSON.parse(cuerpoTexto)
            : cuerpoTexto,
      confirmacion,
    };

    try {
      const res = await fetch("/api/docs/try", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: aBase64(JSON.stringify(pedido)) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        setError(`${datos.error ?? res.status}${datos.detalle ? ` — ${datos.detalle}` : ""}`);
      } else {
        setRespuesta(datos as RespuestaTry);
      }
    } catch (e) {
      setError(`No se pudo ejecutar: ${(e as Error).message}`);
    } finally {
      setEjecutando(false);
      setDialogoAbierto(false);
      setTextoConfirmacion("");
    }
  }

  if (!endpoint.ejecutable) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Este endpoint es una entrada colapsada del catálogo (un catch-all), no una ruta
        concreta: no se puede ejecutar desde acá.
      </div>
    );
  }

  const esProd = ambiente === "PROD";

  return (
    <div className="space-y-4">
      {/* ── Ambiente ── */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs",
          esProd
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-success/40 bg-success/10 text-success",
        )}
      >
        {esProd ? (
          <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          <Terminal className="size-4 shrink-0" aria-hidden="true" />
        )}
        <span className="font-semibold uppercase tracking-wide">
          {montado ? ambiente : "…"}
        </span>
        <span className="text-foreground/70">
          Se ejecuta contra <span className="font-mono">{montado ? host : "…"}</span>, con tu
          sesión de root.
        </span>
      </div>

      {/* ── Parámetros ── */}
      {(parametrosPath.length > 0 || parametrosQuery.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[...parametrosPath, ...parametrosQuery].map((p) => {
            const enPath = p.lugar === "path";
            const valor = enPath ? valoresPath[p.nombre] : valoresQuery[p.nombre];
            return (
              <div key={`${p.lugar}-${p.nombre}`} className="space-y-1">
                <Label htmlFor={`${endpoint.id}-${p.lugar}-${p.nombre}`} className="text-xs">
                  <span className="font-mono">{p.nombre}</span>
                  <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {p.lugar}
                  </span>
                  {enPath && <span className="ml-1 text-destructive">*</span>}
                </Label>
                <Input
                  id={`${endpoint.id}-${p.lugar}-${p.nombre}`}
                  value={valor ?? ""}
                  placeholder={valorDeMuestra(p)}
                  onChange={(e) => {
                    const nuevo = e.target.value;
                    if (enPath) setValoresPath((v) => ({ ...v, [p.nombre]: nuevo }));
                    else setValoresQuery((v) => ({ ...v, [p.nombre]: nuevo }));
                  }}
                  className="h-8 font-mono text-xs"
                />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Cuerpo ── */}
      {escribe && (
        <div className="space-y-1">
          <Label htmlFor={`${endpoint.id}-body`} className="text-xs">
            Cuerpo (JSON)
          </Label>
          <Textarea
            id={`${endpoint.id}-body`}
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={'{\n  "campo": "valor"\n}'}
            className="font-mono text-xs"
          />
          {cuerpo.trim() !== "" && !esJson(cuerpo) && (
            <p className="text-xs text-warning">
              No es JSON válido: se manda tal cual, como texto.
            </p>
          )}
        </div>
      )}

      {/* ── Headers extra ── */}
      <details className="group rounded-lg border">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          Headers adicionales
          <span className="ml-2 font-normal">
            (uno por línea, <span className="font-mono">Nombre: valor</span>)
          </span>
        </summary>
        <div className="border-t p-3">
          <Textarea
            value={headersTexto}
            onChange={(e) => setHeadersTexto(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder={"x-mi-header: valor"}
            className="font-mono text-xs"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-mono">Authorization</span> y{" "}
            <span className="font-mono">cookie</span> los pone el servidor con tu sesión: si
            los escribís acá se descartan.
          </p>
        </div>
      </details>

      {/* ── Acción ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant={escribe && esProd ? "destructive" : "default"}
          disabled={ejecutando || faltanPath.length > 0}
          onClick={() => (escribe ? setDialogoAbierto(true) : void ejecutar())}
        >
          {ejecutando ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="size-4" aria-hidden="true" />
          )}
          {escribe ? `Ejecutar ${endpoint.metodo}…` : "Ejecutar"}
        </Button>

        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
          {endpoint.metodo} {pathCompleto}
        </code>

        {faltanPath.length > 0 && (
          <span className="text-xs text-warning">
            Faltan: {faltanPath.map((p) => p.nombre).join(", ")}
          </span>
        )}
      </div>

      {/* ── Resultado ── */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      {respuesta && (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className={cn("font-mono font-bold", tonoDeStatus(respuesta.status))}>
              {respuesta.status} {respuesta.statusText}
            </span>
            <span className="text-xs text-muted-foreground">{respuesta.duracionMs} ms</span>
            {respuesta.truncado && (
              <Badge variant="warning" className="text-[10px]">
                cuerpo truncado a 1 MB
              </Badge>
            )}
          </div>

          <BloqueCodigo codigo={embellecer(respuesta.body) || "(sin cuerpo)"} titulo="Respuesta" />

          <details className="rounded-lg border">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              Headers de la respuesta ({Object.keys(respuesta.headers).length})
            </summary>
            <div className="overflow-x-auto border-t">
              <table className="w-full text-xs">
                <tbody className="divide-y">
                  {Object.entries(respuesta.headers).map(([k, v]) => (
                    <tr key={k}>
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-muted-foreground">
                        {k}
                      </td>
                      <td className="px-3 py-1.5 font-mono break-all">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}

      {/* ── Confirmación de escritura ── */}
      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert
                className={cn("size-5", esProd ? "text-destructive" : "text-warning")}
                aria-hidden="true"
              />
              Confirmar {endpoint.metodo}
            </DialogTitle>
            <DialogDescription>
              Esto escribe de verdad. Escribí el path exacto para confirmar.
            </DialogDescription>
          </DialogHeader>

          <div
            className={cn(
              "rounded-lg border px-3 py-2.5",
              esProd
                ? "border-destructive/50 bg-destructive/10"
                : "border-success/40 bg-success/10",
            )}
          >
            <p
              className={cn(
                "text-sm font-bold uppercase tracking-wide",
                esProd ? "text-destructive" : "text-success",
              )}
            >
              Ambiente: {montado ? ambiente : "…"}
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {montado ? origen : "…"}
            </p>
            {esProd && (
              <p className="mt-1.5 text-xs text-destructive">
                Este host no dice &quot;dev&quot;: se está tratando como producción.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm">
              Se va a ejecutar{" "}
              <span className="font-mono font-semibold">{endpoint.metodo}</span>{" "}
              <span className="font-mono">{pathCompleto}</span>
            </p>
            <Label htmlFor={`${endpoint.id}-confirmar`} className="text-xs">
              Escribí <span className="font-mono font-semibold">{pathResuelto}</span>
            </Label>
            <Input
              id={`${endpoint.id}-confirmar`}
              value={textoConfirmacion}
              onChange={(e) => setTextoConfirmacion(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-sm"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogoAbierto(false)}>
              Cancelar
            </Button>
            <Button
              variant={esProd ? "destructive" : "default"}
              size="sm"
              disabled={!confirmacionOk || ejecutando}
              onClick={() => void ejecutar(pathResuelto)}
            >
              {ejecutando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Ejecutar {endpoint.metodo}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
