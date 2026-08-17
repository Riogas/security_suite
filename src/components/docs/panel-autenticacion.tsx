"use client";

import * as React from "react";
import { ChevronDown, KeyRound, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResumenAuth } from "@/lib/docs/catalogo";
import { EtiquetaMetodo } from "@/components/docs/etiqueta-metodo";

// =====================================================================
// "Estado de la autenticación" — el apartado que justifica que este portal sea
// solo-root.
//
// Va arriba de todo y abierto, no escondido en una solapa: quien entra acá
// necesita ver, con números y con nombres, qué endpoints de esta aplicación no
// validan absolutamente nada. Publicar eso es el punto (spec §2 y §7); que
// hubiera que buscarlo sería el error.
// =====================================================================

interface Tramo {
  clave: string;
  etiqueta: string;
  cantidad: number;
  /** Clase de color del relleno de la barra. */
  relleno: string;
  /** Clase de color del punto de la leyenda. */
  punto: string;
}

function tramos(auth: ResumenAuth): Tramo[] {
  return [
    {
      clave: "sinAuth",
      etiqueta: "Sin auth",
      cantidad: auth.sinAuth,
      relleno: "bg-destructive",
      punto: "bg-destructive",
    },
    {
      clave: "passthrough",
      etiqueta: "Delegada al backend",
      cantidad: auth.passthrough,
      relleno: "bg-warning",
      punto: "bg-warning",
    },
    {
      clave: "jwtSinVerificar",
      etiqueta: "JWT sin verificar firma",
      cantidad: auth.jwtSinVerificar,
      relleno: "bg-amber-500",
      punto: "bg-amber-500",
    },
    {
      clave: "jwtVerificado",
      etiqueta: "JWT verificado",
      cantidad: auth.jwtVerificado,
      relleno: "bg-success",
      punto: "bg-success",
    },
    {
      clave: "apiKey",
      etiqueta: "x-api-key",
      cantidad: auth.apiKey,
      relleno: "bg-sky-500",
      punto: "bg-sky-500",
    },
    {
      clave: "otros",
      etiqueta: "Otros",
      cantidad: auth.otros,
      relleno: "bg-muted-foreground",
      punto: "bg-muted-foreground",
    },
  ].filter((t) => t.cantidad > 0);
}

function Cifra({
  valor,
  total,
  etiqueta,
  detalle,
  icono: Icono,
  tono,
}: {
  valor: number;
  total?: number;
  etiqueta: string;
  detalle?: string;
  icono: React.ComponentType<{ className?: string }>;
  tono: "peligro" | "advertencia" | "ok" | "neutro";
}) {
  const colores = {
    peligro: "border-destructive/40 bg-destructive/5 text-destructive",
    advertencia: "border-warning/40 bg-warning/5 text-warning",
    ok: "border-success/40 bg-success/5 text-success",
    neutro: "border-border bg-muted/30 text-foreground",
  }[tono];

  return (
    <div className={cn("rounded-xl border p-4", colores)}>
      <div className="flex items-center gap-2">
        <Icono className="size-4 shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium uppercase tracking-wide">{etiqueta}</span>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums leading-none">
        {valor}
        {total !== undefined && (
          <span className="text-base font-normal opacity-60"> / {total}</span>
        )}
      </p>
      {detalle && <p className="mt-1.5 text-xs opacity-80">{detalle}</p>}
    </div>
  );
}

export function PanelAutenticacion({
  auth,
  onIrAEndpoint,
}: {
  auth: ResumenAuth;
  onIrAEndpoint: (id: string) => void;
}) {
  const [listaAbierta, setListaAbierta] = React.useState(false);
  const partes = tramos(auth);
  const total = Math.max(auth.total, 1);

  const porModulo = new Map<string, typeof auth.endpointsSinAuth>();
  for (const e of auth.endpointsSinAuth) {
    const lista = porModulo.get(e.modulo) ?? [];
    lista.push(e);
    porModulo.set(e.modulo, lista);
  }

  return (
    <section
      aria-labelledby="estado-auth"
      className="rounded-2xl border border-destructive/30 bg-card p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="estado-auth"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight"
          >
            <ShieldAlert className="size-5 text-destructive" aria-hidden="true" />
            Estado de la autenticación
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Lo que la app valida hoy, endpoint por endpoint. Es información sensible y es
            exactamente por eso que este portal es solo-root: no se arregla escondiéndola.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra
          valor={auth.sinAuth}
          total={auth.total}
          etiqueta="No validan nada"
          detalle="Cualquiera con acceso de red al puerto los llama."
          icono={ShieldAlert}
          tono="peligro"
        />
        <Cifra
          valor={auth.escriturasSinAuth}
          etiqueta="Escrituras sin auth"
          detalle="POST / PUT / PATCH / DELETE sin ningún control."
          icono={ShieldQuestion}
          tono="peligro"
        />
        <Cifra
          valor={auth.jwtSinVerificar}
          etiqueta="JWT sin verificar firma"
          detalle="Decodifican el payload y confían: el token se fabrica."
          icono={KeyRound}
          tono="advertencia"
        />
        <Cifra
          valor={auth.jwtVerificado}
          etiqueta="JWT verificado"
          detalle="Verifican firma y vencimiento con jwt.verify."
          icono={ShieldCheck}
          tono="ok"
        />
      </div>

      {/* Barra de distribución */}
      <div className="mt-5">
        <div
          className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`Distribución de la autenticación en ${auth.total} endpoints`}
        >
          {partes.map((t) => (
            <div
              key={t.clave}
              className={t.relleno}
              style={{ width: `${(t.cantidad / total) * 100}%` }}
              title={`${t.etiqueta}: ${t.cantidad}`}
            />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {partes.map((t) => (
            <li key={t.clave} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("size-2 rounded-full", t.punto)} aria-hidden="true" />
              {t.etiqueta}
              <span className="font-mono font-semibold text-foreground">{t.cantidad}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Por módulo */}
      {auth.porModulo.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sin auth, por módulo
          </h3>
          <div className="mt-2 space-y-1.5">
            {auth.porModulo.map((m) => (
              <div key={m.modulo} className="flex items-center gap-3 text-xs">
                <span className="w-40 shrink-0 truncate font-medium">{m.modulo}</span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-destructive"
                    style={{ width: `${(m.sinAuth / Math.max(m.total, 1)) * 100}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                  {m.sinAuth}/{m.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista completa */}
      {auth.endpointsSinAuth.length > 0 && (
        <div className="mt-5 rounded-xl border">
          <button
            type="button"
            onClick={() => setListaAbierta((v) => !v)}
            aria-expanded={listaAbierta}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-accent/50"
          >
            <span>
              Ver los {auth.endpointsSinAuth.length} endpoints que no validan nada
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                listaAbierta && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>

          {listaAbierta && (
            <div className="space-y-4 border-t p-4">
              {[...porModulo.entries()].map(([modulo, lista]) => (
                <div key={modulo}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {modulo}
                  </p>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {lista.map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => onIrAEndpoint(e.id)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent"
                        >
                          <EtiquetaMetodo metodo={e.metodo} />
                          <span className="min-w-0 flex-1 truncate font-mono text-xs">
                            {e.ruta}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
