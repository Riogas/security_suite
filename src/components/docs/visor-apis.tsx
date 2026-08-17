"use client";

import * as React from "react";
import { ChevronDown, Layers, Search, ShieldAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CatalogoDocs, EndpointDoc } from "@/lib/docs/catalogo";
import { BadgeAuth, EtiquetaMetodo } from "@/components/docs/etiqueta-metodo";
import { DetalleEndpoint } from "@/components/docs/detalle-endpoint";
import { PanelAutenticacion } from "@/components/docs/panel-autenticacion";

// =====================================================================
// El visor del catálogo de APIs.
//
// Un solo componente de cliente sobre datos ya aplanados por
// `src/lib/docs/catalogo.ts`: filtrar 69 endpoints en memoria es instantáneo y
// no justifica ni estado global ni un round-trip por tecla.
//
// El detalle de cada endpoint se monta **solo cuando se abre**: si no, se
// pagarían 69 formularios de "Try it" y 69 generaciones de ejemplos para ver
// una lista.
//
// ── Dos pestañas, no una pantalla de peaje ──────────────────────────────────
// "Estado de la autenticación" ocupaba la primera pantalla entera: había que
// scrollear ~1000 px para llegar al primer endpoint, cada vez. Sigue publicado
// entero —es la razón por la que este portal es solo-root— pero a un clic, y
// con el contador de "sin auth" en la propia solapa para que nadie tenga que
// acordarse de mirar. Es lo mismo que hace GOYA.
//
// ── Los `top-*` de los sticky no son decorativos ────────────────────────────
// El navbar del dashboard es `sticky top-0 z-40 h-16` (64 px). Con `top-0` la
// barra de búsqueda quedaba DEBAJO de él al scrollear: invisible y sin recibir
// clics. De ahí `top-16` para la barra y `lg:top-[9.5rem]` para la columna de
// módulos, que tiene que quedar por debajo de navbar + barra.
// =====================================================================

const METODOS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

type Pestania = "catalogo" | "auth";

/** Id de ancla en el DOM, estable y sin caracteres raros. */
function ancla(id: string): string {
  return `ep-${id.replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "")}`;
}

export function VisorApis({ catalogo }: { catalogo: CatalogoDocs }) {
  const [pestania, setPestania] = React.useState<Pestania>("catalogo");
  const [busqueda, setBusqueda] = React.useState("");
  const [modulo, setModulo] = React.useState<string | null>(null);
  const [metodos, setMetodos] = React.useState<string[]>([]);
  const [soloSinAuth, setSoloSinAuth] = React.useState(false);
  const [abierto, setAbierto] = React.useState<string | null>(null);
  const [aEnfocar, setAEnfocar] = React.useState<string | null>(null);

  // El <Input> del design system es un componente de función: en React 18 no
  // acepta ref. Se lo enfoca por id, que además sobrevive a cualquier refactor
  // del componente compartido.
  const ID_BUSQUEDA = "docs-buscador";

  // "/" enfoca el buscador, salvo que ya se esté escribiendo en algún lado.
  React.useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const destino = e.target as HTMLElement | null;
      const etiqueta = destino?.tagName;
      if (etiqueta === "INPUT" || etiqueta === "TEXTAREA" || destino?.isContentEditable) return;
      e.preventDefault();
      document.getElementById(ID_BUSQUEDA)?.focus();
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  // Al saltar desde el panel de autenticación, primero se limpia el filtro (si
  // no, el destino puede no estar en la lista) y recién después se scrollea.
  // El efecto corre cuando el catálogo ya está montado: `aEnfocar` se setea en
  // el mismo tick en que se cambia de pestaña.
  React.useEffect(() => {
    if (!aEnfocar) return;
    const nodo = document.getElementById(ancla(aEnfocar));
    nodo?.scrollIntoView({ behavior: "smooth", block: "center" });
    setAEnfocar(null);
  }, [aEnfocar]);

  const terminos = React.useMemo(
    () => busqueda.toLowerCase().split(/\s+/).filter(Boolean),
    [busqueda],
  );

  const filtrados = React.useMemo(() => {
    return catalogo.endpoints.filter((e) => {
      if (modulo && e.modulo !== modulo) return false;
      if (metodos.length > 0 && !metodos.includes(e.metodo)) return false;
      if (soloSinAuth && !e.auth.sinAuth) return false;
      return terminos.every((t) => e.indice.includes(t));
    });
  }, [catalogo.endpoints, modulo, metodos, soloSinAuth, terminos]);

  const grupos = React.useMemo(() => {
    const mapa = new Map<string, EndpointDoc[]>();
    for (const e of filtrados) {
      const lista = mapa.get(e.modulo) ?? [];
      lista.push(e);
      mapa.set(e.modulo, lista);
    }
    return [...mapa.entries()];
  }, [filtrados]);

  function irAEndpoint(id: string) {
    setPestania("catalogo");
    setModulo(null);
    setMetodos([]);
    setSoloSinAuth(false);
    setBusqueda("");
    setAbierto(id);
    setAEnfocar(id);
  }

  const hayFiltro =
    busqueda !== "" || modulo !== null || metodos.length > 0 || soloSinAuth;

  return (
    <div className="space-y-6">
      {/* ── Pestañas ── */}
      <div className="flex flex-wrap gap-1 border-b" role="tablist">
        {(
          [
            ["catalogo", "Catálogo"],
            ["auth", "Estado de la autenticación"],
          ] as Array<[Pestania, string]>
        ).map(([clave, etiqueta]) => {
          const activa = pestania === clave;
          return (
            <button
              key={clave}
              type="button"
              role="tab"
              id={`solapa-${clave}`}
              aria-selected={activa}
              aria-controls={`panel-${clave}`}
              onClick={() => setPestania(clave)}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                activa
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {clave === "auth" && (
                <ShieldAlert
                  className={cn("size-4", catalogo.auth.sinAuth > 0 && "text-destructive")}
                  aria-hidden="true"
                />
              )}
              {etiqueta}
              {clave === "auth" && catalogo.auth.sinAuth > 0 && (
                <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-destructive">
                  {catalogo.auth.sinAuth}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {pestania === "auth" ? (
        <div role="tabpanel" id="panel-auth" aria-labelledby="solapa-auth">
          <PanelAutenticacion auth={catalogo.auth} onIrAEndpoint={irAEndpoint} />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="panel-catalogo"
          aria-labelledby="solapa-catalogo"
          className="space-y-6"
        >
          {/* ── Buscador y filtros ── */}
          <div className="sticky top-16 z-20 -mx-1 rounded-xl border bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id={ID_BUSQUEDA}
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por path, método, módulo o descripción…    ( / )"
                  aria-label="Buscar endpoints"
                  className="h-9 pl-9 pr-9"
                />
                {busqueda !== "" && (
                  <button
                    type="button"
                    onClick={() => setBusqueda("")}
                    aria-label="Limpiar la búsqueda"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {METODOS.map((m) => {
                  const activo = metodos.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={activo}
                      onClick={() =>
                        setMetodos((prev) =>
                          prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
                        )
                      }
                      className={cn(
                        "rounded-md border px-2 py-1 font-mono text-[11px] font-bold transition-colors",
                        activo
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      {m}
                    </button>
                  );
                })}

                <button
                  type="button"
                  aria-pressed={soloSinAuth}
                  onClick={() => setSoloSinAuth((v) => !v)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors",
                    soloSinAuth
                      ? "border-destructive bg-destructive text-white"
                      : "border-destructive/40 text-destructive hover:bg-destructive/10",
                  )}
                >
                  <ShieldAlert className="size-3.5" aria-hidden="true" />
                  Sin auth
                  <span className="font-mono">{catalogo.auth.sinAuth}</span>
                </button>

                {hayFiltro && (
                  <button
                    type="button"
                    onClick={() => {
                      setBusqueda("");
                      setModulo(null);
                      setMetodos([]);
                      setSoloSinAuth(false);
                    }}
                    className="rounded-md px-2 py-1 text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              {filtrados.length} de {catalogo.endpoints.length} endpoints
              {modulo && (
                <>
                  {" · módulo "}
                  <span className="font-medium text-foreground">{modulo}</span>
                </>
              )}
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
            {/* ── Navegación por módulo ── */}
            <nav aria-label="Módulos" className="min-w-0">
              {/* 9.5rem = navbar (4rem) + la barra de búsqueda sticky. */}
              <div className="lg:sticky lg:top-[9.5rem]">
                <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Layers className="size-3.5" aria-hidden="true" />
                  Módulos
                </h2>
                {/* En pantallas chicas la lista se vuelve una fila que scrollea sola:
                    el body de la página nunca scrollea de costado. */}
                <ul className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
                  <li className="shrink-0 lg:shrink">
                    <button
                      type="button"
                      onClick={() => setModulo(null)}
                      aria-current={modulo === null}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                        modulo === null
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      Todos
                      <span className="font-mono text-xs tabular-nums opacity-70">
                        {catalogo.endpoints.length}
                      </span>
                    </button>
                  </li>
                  {catalogo.modulos.map((m) => (
                    <li key={m.nombre} className="shrink-0 lg:shrink">
                      <button
                        type="button"
                        onClick={() => setModulo(m.nombre === modulo ? null : m.nombre)}
                        aria-current={modulo === m.nombre}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                          modulo === m.nombre
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        )}
                      >
                        <span className="min-w-0 truncate">{m.nombre}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {m.sinAuth > 0 && (
                            <span
                              className="size-1.5 rounded-full bg-destructive"
                              title={`${m.sinAuth} sin auth`}
                              aria-label={`${m.sinAuth} sin autenticación`}
                            />
                          )}
                          <span className="font-mono text-xs tabular-nums opacity-70">
                            {m.total}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>

            {/* ── Lista ── */}
            <div className="min-w-0 space-y-8">
              {grupos.length === 0 && (
                <div className="rounded-xl border border-dashed p-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    Ningún endpoint coincide con el filtro.
                  </p>
                </div>
              )}

              {grupos.map(([nombreModulo, endpoints]) => (
                <section key={nombreModulo} aria-labelledby={`modulo-${nombreModulo}`}>
                  <h3
                    id={`modulo-${nombreModulo}`}
                    className="mb-2 flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {nombreModulo}
                    <span className="font-mono text-xs font-normal opacity-70">
                      {endpoints.length}
                    </span>
                  </h3>

                  <div className="divide-y overflow-hidden rounded-xl border bg-card">
                    {endpoints.map((e) => {
                      const expandido = abierto === e.id;
                      return (
                        // scroll-mt: lo que tapan el navbar y la barra sticky.
                        <article key={e.id} id={ancla(e.id)} className="scroll-mt-[10rem]">
                          <button
                            type="button"
                            onClick={() => setAbierto(expandido ? null : e.id)}
                            aria-expanded={expandido}
                            className={cn(
                              "flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-accent/40",
                              expandido && "bg-accent/30",
                            )}
                          >
                            <EtiquetaMetodo metodo={e.metodo} className="mt-0.5" />

                            <div className="min-w-0 flex-1">
                              <p className="break-all font-mono text-sm font-medium">{e.ruta}</p>
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                {e.summary}
                              </p>
                            </div>

                            <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
                              <BadgeAuth auth={e.auth} />
                              {e.anotado && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px]"
                                  title="Tiene entrada en anotaciones.yaml"
                                >
                                  anotado
                                </Badge>
                              )}
                              <ChevronDown
                                className={cn(
                                  "size-4 text-muted-foreground transition-transform",
                                  expandido && "rotate-180",
                                )}
                                aria-hidden="true"
                              />
                            </div>
                          </button>

                          {expandido && (
                            <div className="border-t bg-background/50 p-4 sm:p-5">
                              <DetalleEndpoint endpoint={e} />
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}

              {/* ── Qué no está en el catálogo ── */}
              {(catalogo.colapsados.length > 0 || catalogo.excluidos.length > 0) && (
                <section className="rounded-xl border border-dashed p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Qué no estás mirando
                  </h3>
                  <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                    {catalogo.colapsados.map((c) => (
                      <li key={c.entrada}>
                        <span className="font-mono text-foreground">{c.entrada}</span> —
                        colapsado: {c.motivo}
                      </li>
                    ))}
                    {catalogo.excluidos.map((c) => (
                      <li key={c.patron}>
                        <span className="font-mono text-foreground">{c.patron}</span> — excluido:{" "}
                        {c.motivo}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
