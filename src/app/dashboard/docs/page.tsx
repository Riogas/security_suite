import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { requireRootPorToken, type CodigoDenegacion } from "@/lib/docs/root-guard";
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

/**
 * Qué mostrar según por qué el guard dijo que no. Mandar TODO a /no-autorizado
 * ("No tienes permisos" + botón "Solicitar acceso") es engañoso en tres de los
 * cuatro casos: si la sesión venció hay que volver a entrar, y si falta
 * configurar el proceso no hay permiso que pedirle a nadie — el administrador
 * al que te manda no puede resolverlo aprobando una solicitud.
 */
const MOTIVOS: Record<
  CodigoDenegacion,
  { titulo: string; detalle: string; accion?: "login" }
> = {
  SIN_TOKEN: {
    titulo: "Sesión no iniciada",
    detalle: "Entrá con tu usuario para ver la documentación de APIs.",
    accion: "login",
  },
  TOKEN_VENCIDO: {
    titulo: "Tu sesión venció",
    detalle: "Volvé a entrar y el portal se abre de nuevo. No es un problema de permisos.",
    accion: "login",
  },
  TOKEN_INVALIDO: {
    titulo: "Tu sesión no es válida",
    detalle:
      "El token no pasó la verificación de firma. Volvé a entrar; si sigue pasando, puede ser que el JWT_SECRET del proceso no sea el mismo con el que SecuritySuite firma.",
    accion: "login",
  },
  SECRETO_NO_CONFIGURADO: {
    titulo: "El portal no está configurado",
    detalle:
      "Falta la variable JWT_SECRET en este proceso, o tiene el valor por defecto del código, o es más corta que el mínimo. No es un problema de permisos: hasta que se configure, el portal no abre para nadie. El procedimiento está en docs/api/README.md.",
  },
  ERROR_GUARD: {
    titulo: "No se pudo verificar el permiso",
    detalle:
      "No hubo forma de confirmar que sos root (la base no respondió). El portal no se abre si el permiso no se puede confirmar: es a propósito. Reintentá en un momento.",
  },
  USUARIO_NO_ENCONTRADO: {
    titulo: "Usuario no encontrado",
    detalle:
      "El token nombra a un usuario que no está activo en SecuritySuite. Volvé a entrar con tu cuenta.",
    accion: "login",
  },
  NO_ROOT: {
    titulo: "Acceso reservado",
    detalle:
      "Esta pantalla es solo para root: lista, entre otras cosas, qué endpoints no validan autenticación. Para entrar hace falta el rol Root de SecuritySuite.",
  },
};

export default async function DocsPage() {
  const token = (await cookies()).get("token")?.value ?? null;
  const guard = await requireRootPorToken(token);

  // Fail-closed, pero diciendo la verdad: el motivo cambia qué tiene que hacer
  // quien lo lee. Solo la falta de permiso real va a /no-autorizado, que es la
  // pantalla que ofrece solicitarlo.
  if (!guard.ok) {
    if (guard.code === "NO_ROOT") redirect("/no-autorizado");

    const motivo = MOTIVOS[guard.code] ?? {
      titulo: "No se pudo abrir el portal",
      detalle: `El guard denegó el acceso (${guard.code}).`,
    };

    return (
      <div className="p-4 sm:p-6">
        <PageHeader icon={BookOpen} title="Documentación de APIs" description={motivo.titulo} />
        <div className="max-w-2xl rounded-xl border bg-card p-6 text-sm">
          <p className="text-muted-foreground">{motivo.detalle}</p>
          <p className="mt-4 font-mono text-xs text-muted-foreground">código: {guard.code}</p>
          {motivo.accion === "login" && (
            <Link
              href="/login"
              className="mt-5 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Volver a entrar
            </Link>
          )}
        </div>
      </div>
    );
  }

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
