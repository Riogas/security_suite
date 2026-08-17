import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { requireRootPorToken } from "@/lib/docs/root-guard";
import { SpecNoGeneradoError } from "@/lib/docs/spec";
import { cargarCatalogo } from "@/lib/docs/catalogo";
import { VisorApis } from "@/components/docs/visor-apis";

// Lee docs/api/* del filesystem y consulta Postgres en el guard: runtime Node y
// sin cachear, para que el gate corra de verdad en cada visita.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// /dashboard/docs — portal de documentación de APIs.
//
// El gate corre DEL LADO DEL SERVIDOR, antes de renderizar nada: esta página
// muestra qué endpoints no validan nada, así que un gate de UI no alcanza.
//
// El catálogo se arma acá (server) y baja aplanado al visor (cliente): el
// cliente nunca ve `docs/api/*` crudo ni pide el spec por su cuenta.
// =====================================================================

export default async function DocsPage() {
  const token = (await cookies()).get("token")?.value ?? null;
  const guard = await requireRootPorToken(token);

  // Fail-closed también en la página: cualquier resultado que no sea `ok` sale a
  // /no-autorizado. No se distingue el motivo para no filtrar si el portal existe.
  if (!guard.ok) redirect("/no-autorizado");

  let catalogo;
  try {
    catalogo = await cargarCatalogo();
  } catch (error) {
    if (!(error instanceof SpecNoGeneradoError)) throw error;
    return (
      <div className="p-4 sm:p-6">
        <PageHeader
          icon={BookOpen}
          title="Documentación de APIs"
          description="El catálogo todavía no está generado."
        />
        <div className="rounded-xl border bg-card p-6 text-sm">
          <p>
            Falta <code className="font-mono">docs/api/openapi.json</code>. Generalo con:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
            pnpm docs:api
          </pre>
          <p className="mt-3 text-muted-foreground">
            En un deploy, verificá además que el directorio <code>docs/</code> viaje con el
            código.
          </p>
        </div>
      </div>
    );
  }

  const { anotaciones, auth, modulos } = catalogo;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        icon={BookOpen}
        title="Documentación de APIs"
        description="Catálogo de las APIs propias de SecuritySuite, generado del código con `pnpm docs:api` y completado con las anotaciones a mano. Se puede ejecutar cada endpoint contra este mismo ambiente. Solo visible para root."
        stats={[
          { label: "Endpoints", value: auth.total },
          { label: "Módulos", value: modulos.length },
          {
            label: "Anotados",
            value: `${anotaciones.anotados}/${anotaciones.total}`,
            tone: anotaciones.sinAnotar.length === 0 ? "success" : "muted",
          },
          { label: "Sin auth", value: auth.sinAuth },
        ]}
      />

      {anotaciones.huerfanas.length > 0 && (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="font-medium">
            Hay anotaciones que no matchean ningún endpoint (renombrado o typo):
          </p>
          <ul className="mt-2 list-disc pl-5 font-mono text-xs">
            {anotaciones.huerfanas.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>
      )}

      <VisorApis catalogo={catalogo} />
    </div>
  );
}
