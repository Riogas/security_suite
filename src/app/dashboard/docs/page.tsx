import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { requireRootPorToken } from "@/lib/docs/root-guard";
import {
  agruparPorModulo,
  cargarSpecMergeado,
  SpecNoGeneradoError,
  type EndpointResumen,
} from "@/lib/docs/spec";

// Lee docs/api/* del filesystem y consulta Postgres en el guard: runtime Node y
// sin cachear, para que el gate corra de verdad en cada visita.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// /dashboard/docs — portal de documentación de APIs (fase 1: lista mínima).
//
// El visor completo (parámetros, respuestas, ejemplos, "try it") es otra fase;
// acá va el inventario: método, path y autenticación real, agrupado por módulo.
//
// El gate corre DEL LADO DEL SERVIDOR, antes de renderizar nada: esta página
// muestra qué endpoints no validan nada, así que un gate de UI no alcanza.
// =====================================================================

const COLOR_METODO: Record<string, string> = {
  GET: "text-emerald-600 dark:text-emerald-400",
  POST: "text-blue-600 dark:text-blue-400",
  PUT: "text-amber-600 dark:text-amber-400",
  PATCH: "text-amber-600 dark:text-amber-400",
  DELETE: "text-red-600 dark:text-red-400",
};

function BadgeAuth({ auth }: { auth: EndpointResumen["auth"] }) {
  if (auth.modo === "ninguna") {
    return (
      <Badge variant="destructive" title={auth.detalle}>
        sin auth
      </Badge>
    );
  }
  if (auth.modo === "jwt") {
    return (
      <Badge variant={auth.verificaFirma ? "success" : "warning"} title={auth.detalle}>
        {auth.verificaFirma ? "JWT verificado" : "JWT sin verificar firma"}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" title={auth.detalle}>
      {auth.modo}
    </Badge>
  );
}

export default async function DocsPage() {
  const token = (await cookies()).get("token")?.value ?? null;
  const guard = await requireRootPorToken(token);

  // Fail-closed también en la página: cualquier resultado que no sea `ok` sale a
  // /no-autorizado. No se distingue el motivo para no filtrar si el portal existe.
  if (!guard.ok) redirect("/no-autorizado");

  let contenido;
  try {
    const { endpoints, sinAnotar, anotacionesHuerfanas } = await cargarSpecMergeado();
    const grupos = agruparPorModulo(endpoints);

    contenido = (
      <>
        <PageHeader
          icon={BookOpen}
          title="Documentación de APIs"
          description="Catálogo de las APIs propias de SecuritySuite, generado del código con `pnpm docs:api` y completado con las anotaciones a mano. Solo visible para root."
          stats={[
            { label: "Endpoints", value: endpoints.length },
            { label: "Módulos", value: grupos.length },
            {
              label: "Anotados",
              value: `${endpoints.length - sinAnotar.length}/${endpoints.length}`,
              tone: sinAnotar.length === 0 ? "success" : "muted",
            },
            {
              label: "Sin auth",
              value: endpoints.filter((e) => e.auth.modo === "ninguna").length,
            },
          ]}
        />

        {anotacionesHuerfanas.length > 0 && (
          <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
            <p className="font-medium">
              Hay anotaciones que no matchean ningún endpoint (renombrado o typo):
            </p>
            <ul className="mt-2 list-disc pl-5 font-mono text-xs">
              {anotacionesHuerfanas.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-8">
          {grupos.map(({ modulo, endpoints: delModulo }) => (
            <section key={modulo}>
              <h2 className="mb-3 flex items-baseline gap-3 text-xl font-semibold tracking-tight">
                {modulo}
                <span className="text-sm font-normal text-muted-foreground">
                  {delModulo.length} {delModulo.length === 1 ? "endpoint" : "endpoints"}
                </span>
              </h2>

              <div className="divide-y rounded-xl border bg-card">
                {delModulo.map((e) => (
                  <div
                    key={`${e.metodo} ${e.ruta}`}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <span
                      className={`w-16 shrink-0 font-mono text-xs font-bold ${
                        COLOR_METODO[e.metodo] ?? "text-muted-foreground"
                      }`}
                    >
                      {e.metodo}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm">{e.ruta}</p>
                      <p className="truncate text-xs text-muted-foreground">{e.summary}</p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <BadgeAuth auth={e.auth} />
                      {e.anotado && (
                        <Badge variant="outline" title="Tiene entrada en anotaciones.yaml">
                          anotado
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </>
    );
  } catch (error) {
    const falta = error instanceof SpecNoGeneradoError;
    if (!falta) throw error;
    contenido = (
      <>
        <PageHeader
          icon={BookOpen}
          title="Documentación de APIs"
          description="El catálogo todavía no está generado."
        />
        <div className="rounded-xl border bg-card p-6 text-sm">
          <p>
            Falta <code className="font-mono">docs/api/openapi.json</code>. Generalo con:
          </p>
          <pre className="mt-3 rounded-lg bg-muted p-3 font-mono text-xs">pnpm docs:api</pre>
          <p className="mt-3 text-muted-foreground">
            En un deploy, verificá además que el directorio <code>docs/</code> viaje con el
            código.
          </p>
        </div>
      </>
    );
  }

  return <div className="p-6">{contenido}</div>;
}
