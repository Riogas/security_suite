import * as fs from "fs/promises";
import * as path from "path";
import { load as parsearYaml } from "js-yaml";

// =====================================================================
// Carga del catálogo de APIs que sirve `GET /api/docs/spec`.
//
//   docs/api/openapi.json   generado por `pnpm docs:api` (no se edita a mano)
//   docs/api/anotaciones.yaml  escrito a mano: descripciones, consumidores,
//                              ejemplos, notas
//
// Las anotaciones SIEMPRE ganan sobre lo inferido (spec §5.1): el generador
// describe lo que el código hace, la anotación aporta el porqué, y cuando las
// dos hablan de lo mismo la de la persona es la que vale.
//
// Los dos archivos se leen del filesystem en cada request (sin cache): son
// chicos, la página es solo-root y así un `pnpm docs:api` se ve sin reiniciar.
// =====================================================================

const DIR_DOCS = path.join(process.cwd(), "docs", "api");
const RUTA_OPENAPI = path.join(DIR_DOCS, "openapi.json");
const RUTA_ANOTACIONES = path.join(DIR_DOCS, "anotaciones.yaml");

/** Una anotación a mano. Todo opcional: se anota lo que hace falta, nada más. */
export interface Anotacion {
  summary?: string;
  description?: string;
  tags?: string[];
  /** Quién llama a este endpoint (VB6, el sender de GeneXus, el proxy de GOYA…). */
  consumidores?: string[];
  /** Advertencias: comportamientos raros, deudas, cosas que muerden. */
  notas?: string[];
  ejemplos?: Array<{ lenguaje?: string; titulo?: string; codigo?: string }>;
  /** Pisa lo inferido por el parser cuando la detección estática se queda corta. */
  auth?: Record<string, unknown>;
  /** Respuestas por código, en formato OpenAPI. */
  responses?: Record<string, unknown>;
}

export interface ArchivoAnotaciones {
  version?: number;
  endpoints?: Record<string, Anotacion>;
}

export type Operacion = Record<string, unknown>;
export type DocumentoOpenApi = Record<string, unknown> & {
  paths?: Record<string, Record<string, Operacion>>;
};

/** Una fila del catálogo, ya lista para pintar. */
export interface EndpointResumen {
  metodo: string;
  ruta: string;
  modulo: string;
  summary: string;
  auth: { modo: string; verificaFirma?: boolean; detalle?: string };
  anotado: boolean;
  archivo?: string;
}

export class SpecNoGeneradoError extends Error {
  constructor() {
    super(
      "Falta docs/api/openapi.json. Generalo con `pnpm docs:api` y asegurate de que docs/ viaje en el deploy.",
    );
    this.name = "SpecNoGeneradoError";
  }
}

async function leerOpenApi(): Promise<DocumentoOpenApi> {
  let crudo: string;
  try {
    crudo = await fs.readFile(RUTA_OPENAPI, "utf8");
  } catch {
    throw new SpecNoGeneradoError();
  }
  return JSON.parse(crudo) as DocumentoOpenApi;
}

/**
 * Lee las anotaciones. Si el archivo no existe todavía devuelve vacío: el
 * catálogo generado se sirve igual. Si existe pero está mal formado, la
 * excepción sube — un YAML roto es un error a arreglar, no algo a ignorar en
 * silencio.
 */
async function leerAnotaciones(): Promise<ArchivoAnotaciones> {
  let crudo: string;
  try {
    crudo = await fs.readFile(RUTA_ANOTACIONES, "utf8");
  } catch {
    return {};
  }
  const parseado = parsearYaml(crudo);
  if (!parseado || typeof parseado !== "object") return {};
  return parseado as ArchivoAnotaciones;
}

/** Clave de una anotación: `"POST /api/db/permisos"`, tal cual se lee. */
function clave(metodo: string, ruta: string): string {
  return `${metodo.toUpperCase()} ${ruta}`;
}

function aplicarAnotacion(operacion: Operacion, anotacion: Anotacion): Operacion {
  const fusionada: Operacion = { ...operacion, "x-anotado": true };

  if (anotacion.summary) fusionada.summary = anotacion.summary;
  if (anotacion.description) fusionada.description = anotacion.description;
  if (anotacion.tags?.length) fusionada.tags = anotacion.tags;
  if (anotacion.consumidores?.length) fusionada["x-consumidores"] = anotacion.consumidores;
  if (anotacion.notas?.length) fusionada["x-notas"] = anotacion.notas;
  if (anotacion.ejemplos?.length) fusionada["x-ejemplos"] = anotacion.ejemplos;
  if (anotacion.responses) fusionada.responses = anotacion.responses;
  if (anotacion.auth) {
    fusionada["x-auth"] = { ...(operacion["x-auth"] as object), ...anotacion.auth };
  }

  return fusionada;
}

export interface SpecMergeado {
  documento: DocumentoOpenApi;
  endpoints: EndpointResumen[];
  /** Claves anotadas que no matchean ningún endpoint: anotación vieja o con typo. */
  anotacionesHuerfanas: string[];
  sinAnotar: string[];
  hayAnotaciones: boolean;
}

/**
 * Devuelve el documento final (generado + anotaciones) más el resumen plano que
 * consume la página. `anotacionesHuerfanas` y `sinAnotar` son la materia prima
 * del test antienvejecimiento de la fase 7.
 */
export async function cargarSpecMergeado(): Promise<SpecMergeado> {
  const documento = await leerOpenApi();
  const anotaciones = await leerAnotaciones();
  const porClave = anotaciones.endpoints ?? {};
  const usadas = new Set<string>();

  const paths = documento.paths ?? {};
  const endpoints: EndpointResumen[] = [];
  const sinAnotar: string[] = [];

  for (const ruta of Object.keys(paths)) {
    for (const metodo of Object.keys(paths[ruta])) {
      const k = clave(metodo, ruta);
      const anotacion = porClave[k];
      if (anotacion) usadas.add(k);

      const operacion = anotacion
        ? aplicarAnotacion(paths[ruta][metodo], anotacion)
        : paths[ruta][metodo];
      paths[ruta][metodo] = operacion;

      if (!anotacion) sinAnotar.push(k);

      const auth = (operacion["x-auth"] ?? {}) as Partial<EndpointResumen["auth"]>;
      endpoints.push({
        metodo: metodo.toUpperCase(),
        ruta,
        modulo: (operacion.tags as string[] | undefined)?.[0] ?? "otros",
        summary: (operacion.summary as string | undefined) ?? k,
        auth: { ...auth, modo: auth.modo ?? "desconocida" },
        anotado: Boolean(anotacion),
        archivo: operacion["x-archivo"] as string | undefined,
      });
    }
  }

  const anotacionesHuerfanas = Object.keys(porClave)
    .filter((k) => !usadas.has(k))
    .sort();

  documento["x-anotaciones"] = {
    total: endpoints.length,
    anotados: endpoints.length - sinAnotar.length,
    sinAnotar,
    huerfanas: anotacionesHuerfanas,
  };

  return {
    documento,
    endpoints,
    anotacionesHuerfanas,
    sinAnotar,
    hayAnotaciones: Object.keys(porClave).length > 0,
  };
}

/** Agrupa los endpoints por módulo, con los módulos y las rutas ordenados. */
export function agruparPorModulo(
  endpoints: EndpointResumen[],
): Array<{ modulo: string; endpoints: EndpointResumen[] }> {
  const mapa = new Map<string, EndpointResumen[]>();
  for (const e of endpoints) {
    const lista = mapa.get(e.modulo) ?? [];
    lista.push(e);
    mapa.set(e.modulo, lista);
  }
  return [...mapa.keys()]
    .sort()
    .map((modulo) => ({
      modulo,
      endpoints: (mapa.get(modulo) as EndpointResumen[]).sort(
        (a, b) => a.ruta.localeCompare(b.ruta) || a.metodo.localeCompare(b.metodo),
      ),
    }));
}
