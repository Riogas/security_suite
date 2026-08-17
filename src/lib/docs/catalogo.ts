import { cargarSpecMergeado, type DocumentoOpenApi, type Operacion } from "@/lib/docs/spec";

// =====================================================================
// Del documento OpenAPI mergeado a la estructura que pinta el visor.
//
// El visor es un componente de cliente y no debería estar leyendo JSON Schema
// crudo ni adivinando qué significa `x-auth.detectadoEn`. Acá, del lado del
// servidor, el documento se aplana a algo plano y serializable: una lista de
// endpoints, los módulos, y —lo importante— el estado real de la autenticación
// con números y nombres, que es la razón por la que este portal es solo-root.
//
// Todo lo que sale de acá viaja tal cual al cliente: nada de funciones, nada de
// `undefined` en el medio de un array, nada que no sobreviva a un JSON.
// =====================================================================

/** Cómo se muestra la autenticación de un endpoint en el badge. */
export type TonoAuth = "peligro" | "advertencia" | "ok" | "neutro";

export interface AuthDoc {
  /** Lo que dijo el parser (o la anotación): ninguna, jwt, api-key, passthrough… */
  modo: string;
  /** ¿Hace `jwt.verify`, o solo decodifica el payload? */
  verificaFirma: boolean;
  /** "handler" o "archivo": cuán preciso es el dato. */
  detectadoEn?: string;
  detalle?: string;
  /** Texto del badge. */
  etiqueta: string;
  tono: TonoAuth;
  /** Los que no validan nada. Es la lista que un root quiere ver primero. */
  sinAuth: boolean;
}

export interface ParametroDoc {
  nombre: string;
  lugar: string; // query | path | header
  requerido: boolean;
  tipo: string;
  descripcion?: string;
  ejemplo?: string;
}

export interface RespuestaDoc {
  codigo: string;
  descripcion: string;
  /** JSON de ejemplo, ya indentado. */
  ejemplo?: string;
  esError: boolean;
}

export interface ErrorDoc {
  status?: number;
  code?: string;
  cuando?: string;
}

export interface EjemploDoc {
  lenguaje: string;
  titulo?: string;
  codigo: string;
}

export interface CampoCuerpo {
  nombre: string;
  tipo?: string;
  requerido?: boolean;
  descripcion?: string;
}

export interface CuerpoDoc {
  descripcion?: string;
  contentType: string;
  requerido: boolean;
  /** Campos, cuando la anotación los enumera. */
  campos: CampoCuerpo[];
  /** Ejemplo listo para pegar en el formulario del Try it. */
  ejemplo?: string;
  /** JSON Schema, indentado, cuando lo hay. */
  schema?: string;
}

export interface EndpointDoc {
  /** `get /api/db/usuarios` — estable, sirve de ancla y de key de React. */
  id: string;
  metodo: string;
  ruta: string;
  modulo: string;
  summary: string;
  descripcion?: string;
  auth: AuthDoc;
  consumidores: string[];
  notas: string[];
  ejemplos: EjemploDoc[];
  parametros: ParametroDoc[];
  cuerpo?: CuerpoDoc;
  respuestas: RespuestaDoc[];
  errores: ErrorDoc[];
  anotado: boolean;
  archivo?: string;
  /** El catch-all del proxy no se ejecuta desde acá: no es una ruta concreta. */
  ejecutable: boolean;
  /** Todo el texto en minúscula, para que el buscador filtre sin recalcular. */
  indice: string;
}

export interface ModuloDoc {
  nombre: string;
  total: number;
  sinAuth: number;
}

export interface ResumenAuth {
  total: number;
  sinAuth: number;
  jwtVerificado: number;
  jwtSinVerificar: number;
  apiKey: number;
  passthrough: number;
  otros: number;
  /** Los endpoints sin auth, en el orden en que conviene leerlos. */
  endpointsSinAuth: Array<{ id: string; metodo: string; ruta: string; modulo: string }>;
  /** Cuántos sin auth por módulo, de mayor a menor. */
  porModulo: Array<{ modulo: string; sinAuth: number; total: number }>;
  /** Cuántos sin auth escriben (POST/PUT/PATCH/DELETE): los que más queman. */
  escriturasSinAuth: number;
}

export interface CatalogoDocs {
  titulo: string;
  version: string;
  descripcion?: string;
  aplicacionId?: number;
  endpoints: EndpointDoc[];
  modulos: ModuloDoc[];
  auth: ResumenAuth;
  anotaciones: { total: number; anotados: number; sinAnotar: string[]; huerfanas: string[] };
  colapsados: Array<{ entrada: string; motivo: string }>;
  excluidos: Array<{ patron: string; motivo: string }>;
}

const METODOS_DE_ESCRITURA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// ─── Autenticación ──────────────────────────────────────────────────────────

/**
 * El badge. Los cuatro casos que le importan a quien mira: JWT, x-api-key,
 * token en el body, y **sin auth**.
 *
 * `jwt` se parte en dos a propósito: "verificado" es `jwt.verify` (firma y
 * vencimiento); "sin verificar firma" es decodificar el payload en base64 y
 * confiar. Lo segundo no es autenticación —cualquiera arma ese token— y el
 * badge tiene que decirlo, no esconderlo detrás de la palabra "JWT".
 */
export function describirAuth(crudo: unknown): AuthDoc {
  const a = (crudo ?? {}) as Record<string, unknown>;
  const modo = typeof a.modo === "string" ? a.modo : "desconocida";
  const verificaFirma = a.verificaFirma === true;
  const base = {
    modo,
    verificaFirma,
    detectadoEn: typeof a.detectadoEn === "string" ? a.detectadoEn : undefined,
    detalle: typeof a.detalle === "string" ? a.detalle : undefined,
  };

  switch (modo) {
    case "ninguna":
      return { ...base, etiqueta: "SIN AUTH", tono: "peligro", sinAuth: true };
    case "jwt":
      return verificaFirma
        ? { ...base, etiqueta: "JWT verificado", tono: "ok", sinAuth: false }
        : { ...base, etiqueta: "JWT sin verificar firma", tono: "advertencia", sinAuth: false };
    case "api-key":
      return { ...base, etiqueta: "x-api-key", tono: "neutro", sinAuth: false };
    case "token-en-body":
      return { ...base, etiqueta: "token en el body", tono: "advertencia", sinAuth: false };
    case "passthrough":
      return { ...base, etiqueta: "delegada al backend", tono: "advertencia", sinAuth: false };
    default:
      return { ...base, etiqueta: modo, tono: "neutro", sinAuth: false };
  }
}

// ─── Piezas de una operación ────────────────────────────────────────────────

function textoDeSchema(schema: unknown): string {
  const s = (schema ?? {}) as Record<string, unknown>;
  const tipo = typeof s.type === "string" ? s.type : undefined;
  if (Array.isArray(s.enum)) return `enum(${s.enum.map(String).join(" | ")})`;
  if (tipo === "array") {
    const items = (s.items ?? {}) as Record<string, unknown>;
    return `${typeof items.type === "string" ? items.type : "any"}[]`;
  }
  return tipo ?? "string";
}

function comoJson(valor: unknown): string | undefined {
  if (valor === undefined) return undefined;
  if (typeof valor === "string") return valor;
  try {
    return JSON.stringify(valor, null, 2);
  } catch {
    return undefined;
  }
}

function extraerParametros(operacion: Operacion): ParametroDoc[] {
  const crudos = Array.isArray(operacion.parameters) ? operacion.parameters : [];
  const orden: Record<string, number> = { path: 0, query: 1, header: 2, cookie: 3 };
  return (crudos as Array<Record<string, unknown>>)
    .map((p) => ({
      nombre: String(p.name ?? ""),
      lugar: String(p.in ?? "query"),
      requerido: p.required === true,
      tipo: textoDeSchema(p.schema),
      descripcion: typeof p.description === "string" ? p.description : undefined,
      ejemplo: p.example === undefined ? undefined : String(p.example),
    }))
    .filter((p) => p.nombre !== "")
    .sort(
      (a, b) =>
        (orden[a.lugar] ?? 9) - (orden[b.lugar] ?? 9) ||
        Number(b.requerido) - Number(a.requerido) ||
        a.nombre.localeCompare(b.nombre),
    );
}

/**
 * El cuerpo del request. Acepta las dos formas que puede tomar una anotación:
 * la de OpenAPI (`content["application/json"].schema`) y la forma corta
 * (`descripcion` + `campos` + `ejemplo`), que es la que se escribe a mano sin
 * pelearse con JSON Schema.
 */
function extraerCuerpo(operacion: Operacion): CuerpoDoc | undefined {
  const rb = operacion.requestBody as Record<string, unknown> | undefined;
  if (!rb) return undefined;

  const contenido = (rb.content ?? {}) as Record<string, Record<string, unknown>>;
  const contentType = Object.keys(contenido)[0] ?? "application/json";
  const medio = contenido[contentType] ?? {};

  const camposCrudos = Array.isArray(rb.campos) ? (rb.campos as Array<Record<string, unknown>>) : [];

  const cuerpo: CuerpoDoc = {
    descripcion:
      (typeof rb.descripcion === "string" ? rb.descripcion : undefined) ??
      (typeof rb.description === "string" ? rb.description : undefined),
    contentType,
    requerido: rb.required === true || rb.requerido === true,
    campos: camposCrudos.map((c) => ({
      nombre: String(c.nombre ?? c.name ?? ""),
      tipo: typeof c.tipo === "string" ? c.tipo : undefined,
      requerido: c.requerido === true || c.required === true,
      descripcion:
        (typeof c.descripcion === "string" ? c.descripcion : undefined) ??
        (typeof c.description === "string" ? c.description : undefined),
    })),
    ejemplo: comoJson(rb.ejemplo ?? medio.example),
    schema: medio.schema ? comoJson(medio.schema) : undefined,
  };

  return cuerpo;
}

function extraerRespuestas(operacion: Operacion): RespuestaDoc[] {
  const crudas = (operacion.responses ?? {}) as Record<string, Record<string, unknown>>;
  return Object.entries(crudas)
    .map(([codigo, r]) => {
      const contenido = (r.content ?? {}) as Record<string, Record<string, unknown>>;
      const medio = contenido[Object.keys(contenido)[0] ?? ""] ?? {};
      const numero = Number(codigo);
      return {
        codigo,
        descripcion: typeof r.description === "string" ? r.description : "",
        ejemplo: comoJson(r.ejemplo ?? medio.example),
        esError: Number.isFinite(numero) && numero >= 400,
      };
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
}

function listaDeTextos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v) => typeof v === "string") : [];
}

// ─── Armado del catálogo ────────────────────────────────────────────────────

export function construirCatalogo(documento: DocumentoOpenApi): CatalogoDocs {
  const info = (documento.info ?? {}) as Record<string, unknown>;
  const paths = documento.paths ?? {};

  const colapsados = (
    Array.isArray(documento["x-colapsados"]) ? documento["x-colapsados"] : []
  ) as Array<Record<string, unknown>>;
  const rutasColapsadas = new Set(colapsados.map((c) => String(c.entrada ?? "")));

  const endpoints: EndpointDoc[] = [];

  for (const ruta of Object.keys(paths)) {
    for (const metodoCrudo of Object.keys(paths[ruta])) {
      const operacion = paths[ruta][metodoCrudo];
      const metodo = metodoCrudo.toUpperCase();
      const auth = describirAuth(operacion["x-auth"]);
      const modulo = (operacion.tags as string[] | undefined)?.[0] ?? "otros";
      const summary = (operacion.summary as string | undefined) ?? `${metodo} ${ruta}`;
      const descripcion = operacion.description as string | undefined;
      const consumidores = listaDeTextos(operacion["x-consumidores"]);
      const notas = listaDeTextos(operacion["x-notas"]);
      const parametros = extraerParametros(operacion);
      const respuestas = extraerRespuestas(operacion);

      const erroresAnotados = (
        Array.isArray(operacion["x-errores"]) ? operacion["x-errores"] : []
      ) as ErrorDoc[];
      // Sin lista explícita, los errores conocidos son las respuestas >= 400 que
      // ya están documentadas. Mejor eso que una sección vacía.
      const errores: ErrorDoc[] =
        erroresAnotados.length > 0
          ? erroresAnotados
          : respuestas
              .filter((r) => r.esError)
              .map((r) => ({ status: Number(r.codigo), cuando: r.descripcion }));

      const ejemplos = (
        Array.isArray(operacion["x-ejemplos"]) ? operacion["x-ejemplos"] : []
      ) as Array<Record<string, unknown>>;

      const endpoint: EndpointDoc = {
        id: `${metodoCrudo.toLowerCase()} ${ruta}`,
        metodo,
        ruta,
        modulo,
        summary,
        descripcion,
        auth,
        consumidores,
        notas,
        ejemplos: ejemplos
          .map((e) => ({
            lenguaje: String(e.lenguaje ?? "texto"),
            titulo: typeof e.titulo === "string" ? e.titulo : undefined,
            codigo: String(e.codigo ?? ""),
          }))
          .filter((e) => e.codigo !== ""),
        parametros,
        cuerpo: extraerCuerpo(operacion),
        respuestas,
        errores,
        anotado: operacion["x-anotado"] === true,
        archivo: operacion["x-archivo"] as string | undefined,
        ejecutable: !rutasColapsadas.has(ruta),
        indice: "",
      };

      endpoint.indice = [
        metodo,
        ruta,
        modulo,
        summary,
        descripcion ?? "",
        consumidores.join(" "),
        notas.join(" "),
        auth.etiqueta,
        parametros.map((p) => `${p.nombre} ${p.descripcion ?? ""}`).join(" "),
      ]
        .join(" ")
        .toLowerCase();

      endpoints.push(endpoint);
    }
  }

  endpoints.sort(
    (a, b) =>
      a.modulo.localeCompare(b.modulo) ||
      a.ruta.localeCompare(b.ruta) ||
      a.metodo.localeCompare(b.metodo),
  );

  // ── Módulos ──
  const porModulo = new Map<string, ModuloDoc>();
  for (const e of endpoints) {
    const m = porModulo.get(e.modulo) ?? { nombre: e.modulo, total: 0, sinAuth: 0 };
    m.total += 1;
    if (e.auth.sinAuth) m.sinAuth += 1;
    porModulo.set(e.modulo, m);
  }
  const modulos = [...porModulo.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));

  // ── Estado de la autenticación ──
  const sinAuth = endpoints.filter((e) => e.auth.sinAuth);
  const resumenAuth: ResumenAuth = {
    total: endpoints.length,
    sinAuth: sinAuth.length,
    jwtVerificado: endpoints.filter((e) => e.auth.modo === "jwt" && e.auth.verificaFirma).length,
    jwtSinVerificar: endpoints.filter((e) => e.auth.modo === "jwt" && !e.auth.verificaFirma).length,
    apiKey: endpoints.filter((e) => e.auth.modo === "api-key").length,
    passthrough: endpoints.filter((e) => e.auth.modo === "passthrough").length,
    otros: endpoints.filter(
      (e) => !["ninguna", "jwt", "api-key", "passthrough"].includes(e.auth.modo),
    ).length,
    endpointsSinAuth: sinAuth.map((e) => ({
      id: e.id,
      metodo: e.metodo,
      ruta: e.ruta,
      modulo: e.modulo,
    })),
    porModulo: modulos
      .filter((m) => m.sinAuth > 0)
      .map((m) => ({ modulo: m.nombre, sinAuth: m.sinAuth, total: m.total }))
      .sort((a, b) => b.sinAuth - a.sinAuth || a.modulo.localeCompare(b.modulo)),
    escriturasSinAuth: sinAuth.filter((e) => METODOS_DE_ESCRITURA.has(e.metodo)).length,
  };

  const anot = (documento["x-anotaciones"] ?? {}) as Record<string, unknown>;

  return {
    titulo: String(info.title ?? "APIs"),
    version: String(info.version ?? ""),
    descripcion: typeof info.description === "string" ? info.description : undefined,
    aplicacionId:
      typeof documento["x-aplicacion-id"] === "number"
        ? (documento["x-aplicacion-id"] as number)
        : undefined,
    endpoints,
    modulos,
    auth: resumenAuth,
    anotaciones: {
      total: Number(anot.total ?? endpoints.length),
      anotados: Number(anot.anotados ?? endpoints.filter((e) => e.anotado).length),
      sinAnotar: listaDeTextos(anot.sinAnotar),
      huerfanas: listaDeTextos(anot.huerfanas),
    },
    colapsados: colapsados.map((c) => ({
      entrada: String(c.entrada ?? ""),
      motivo: String(c.motivo ?? ""),
    })),
    excluidos: (
      (Array.isArray(documento["x-excluidos"]) ? documento["x-excluidos"] : []) as Array<
        Record<string, unknown>
      >
    ).map((c) => ({ patron: String(c.patron ?? ""), motivo: String(c.motivo ?? "") })),
  };
}

/** Atajo para la página: leer del filesystem, mergear y aplanar. */
export async function cargarCatalogo(): Promise<CatalogoDocs> {
  const { documento } = await cargarSpecMergeado();
  return construirCatalogo(documento);
}
