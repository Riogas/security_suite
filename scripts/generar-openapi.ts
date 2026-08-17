/**
 * scripts/generar-openapi.ts
 *
 * Generador del catálogo de APIs de SecuritySuite (app 1) — fase 3 del portal
 * `/docs` (ver docs/superpowers/specs/2026-08-17-portal-docs-apis-design.md).
 *
 * Parser ESTÁTICO: recorre `src/app/api/**\/route.ts`, deriva el path desde la
 * estructura de carpetas, detecta los handlers exportados y levanta el comentario
 * de cabecera de cada uno. No importa ni ejecuta nada de la app: no necesita base
 * de datos, ni backend GeneXus, ni servidor levantado.
 *
 * Salida: docs/api/openapi.json (OpenAPI 3.1), determinista — dos corridas
 * seguidas sobre el mismo código producen bytes idénticos (no hay timestamps ni
 * orden dependiente del filesystem). Por eso el JSON se versiona en el repo.
 *
 * Uso:
 *   pnpm docs:api              regenera docs/api/openapi.json
 *   pnpm docs:api --check      no escribe; sale con código 1 si el JSON quedó viejo
 */

import * as fs from "fs";
import * as path from "path";

// ─── Configuración ──────────────────────────────────────────────────────────

const RAIZ = process.cwd();
const DIR_API = path.join(RAIZ, "src", "app", "api");
const SALIDA = path.join(RAIZ, "docs", "api", "openapi.json");

const METODOS_HTTP = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
type MetodoHttp = (typeof METODOS_HTTP)[number];

/**
 * Handlers que el parser NO documenta uno por uno, con el motivo. El catch-all
 * de GeneXus se documenta después como UNA entrada (ver `entradaProxy`): son
 * endpoints de otro sistema, enumerarlos acá sería inventar un contrato ajeno.
 */
const EXCLUIDOS: Array<{ patron: RegExp; motivo: string }> = [
  {
    patron: /\[\.\.\.proxy\]/,
    motivo:
      "Catch-all que reenvía a GeneXus/Tomcat (BACKEND_BASE_URL). Se documenta como una sola entrada; los endpoints del otro lado pertenecen a GeneXus y no se enumeran acá.",
  },
  {
    patron: /(^|[\\/])test-proxy([\\/]|$)/,
    motivo: "Endpoint de diagnóstico del proxy, no es parte del contrato público de la app.",
  },
];

// ─── Recorrido de archivos ──────────────────────────────────────────────────

function listarRoutes(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...listarRoutes(completo));
    else if (entrada.name === "route.ts" || entrada.name === "route.tsx") salida.push(completo);
  }
  // Orden alfabético explícito: readdirSync no garantiza el mismo orden en todos
  // los sistemas de archivos y el JSON tiene que salir siempre igual.
  return salida.sort();
}

/**
 * `src/app/api/db/usuarios/[id]/route.ts` → `/api/db/usuarios/{id}`.
 * Descarta los route groups `(grupo)` y los slots paralelos `@slot`, que no
 * forman parte de la URL.
 */
function pathDesdeArchivo(archivo: string): string {
  const rel = path
    .relative(path.join(RAIZ, "src", "app"), archivo)
    .split(path.sep)
    .slice(0, -1); // saca "route.ts"

  const segmentos = rel
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")) && !s.startsWith("@"))
    .map((s) => {
      const m = /^\[(\.\.\.)?(.+)\]$/.exec(s);
      return m ? `{${m[2]}}` : s;
    });

  return "/" + segmentos.join("/");
}

/** Módulo al que pertenece el endpoint: `/api/db/usuarios/{id}` → `usuarios`. */
function moduloDePath(ruta: string): string {
  const partes = ruta.split("/").filter(Boolean); // ["api","db","usuarios","{id}"]
  const sinApi = partes[0] === "api" ? partes.slice(1) : partes;
  const sinDb = sinApi[0] === "db" ? sinApi.slice(1) : sinApi;
  return sinDb[0] ?? "raiz";
}

// ─── Lectura de comentarios ─────────────────────────────────────────────────

// Caracteres con los que este repo dibuja las reglas de sus comentarios de
// cabecera: `// ==========`, `// ─── GET: … ───`, etc. Son decoración, no texto.
const DECORATIVOS = "=\\-*_─━│┄┈";
const RE_SEPARADOR = new RegExp(`^[${DECORATIVOS}\\s]*$`);
// Se exigen 2+ caracteres para no comerse las viñetas `- item` de las listas.
const RE_ADORNO_IZQ = new RegExp(`^[${DECORATIVOS}]{2,}\\s*`);
const RE_ADORNO_DER = new RegExp(`\\s*[${DECORATIVOS}]{2,}$`);

/**
 * Deja el texto del comentario sin `//`, `/**`, `*`, `*​/`, sin líneas que son
 * solo una regla horizontal y sin los adornos que envuelven a un título
 * (`─── GET: listar ───` → `GET: listar`).
 */
function limpiarComentario(lineas: string[]): string[] {
  return lineas
    .map((l) =>
      l
        .replace(/^\s*\/\*\*?/, "")
        .replace(/\*\/\s*$/, "")
        .replace(/^\s*\*\s?/, "")
        .replace(/^\s*\/\/\s?/, "")
        .trimEnd(),
    )
    .filter((l) => l.trim() === "" || !RE_SEPARADOR.test(l))
    .map((l) => (l.trim() === "" ? "" : l.replace(RE_ADORNO_IZQ, "").replace(RE_ADORNO_DER, "")));
}

function esLineaComentario(linea: string): boolean {
  const t = linea.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.endsWith("*/");
}

/**
 * Bloque de comentario inmediatamente anterior a `indice` (sin líneas en blanco
 * de por medio). Es donde este repo pone la doc del handler: ver
 * `src/app/api/db/menu/route.ts` y `src/app/api/db/permisos/route.ts`.
 */
function comentarioPrevio(lineas: string[], indice: number): string[] {
  let i = indice - 1;
  if (i >= 0 && lineas[i].trim() === "") i--; // tolera UNA línea en blanco de separación
  const fin = i;
  while (i >= 0 && esLineaComentario(lineas[i])) i--;
  if (i === fin) return [];
  return limpiarComentario(lineas.slice(i + 1, fin + 1));
}

/** Primer bloque de comentario del archivo (fallback cuando el handler no tiene uno propio). */
function comentarioDeCabecera(lineas: string[]): string[] {
  for (let i = 0; i < lineas.length; i++) {
    if (/^\s*export\s/.test(lineas[i])) break;
    if (!esLineaComentario(lineas[i])) continue;
    let j = i;
    while (j < lineas.length && esLineaComentario(lineas[j])) j++;
    const bloque = limpiarComentario(lineas.slice(i, j));
    if (bloque.some((l) => l.trim() !== "")) return bloque;
    i = j;
  }
  return [];
}

function aTexto(bloque: string[]): string {
  return bloque.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const RE_TITULO_REDUNDANTE = new RegExp(`^(?:${METODOS_HTTP.join("|")})\\s+/[^\\s?]*$`);

/**
 * Resumen del bloque. Muchos comentarios de este repo arrancan repitiendo
 * `POST /api/db/permisos`, que es exactamente el método y el path que la fila ya
 * muestra: en ese caso se usa la línea siguiente, que es la que dice algo.
 */
function primeraLinea(bloque: string[]): string {
  const utiles = bloque.map((l) => l.trim()).filter((l) => l !== "");
  if (utiles.length === 0) return "";
  if (utiles.length > 1 && RE_TITULO_REDUNDANTE.test(utiles[0])) return utiles[1];
  return utiles[0];
}

// ─── Detección de handlers, auth y parámetros ───────────────────────────────

interface HandlerDetectado {
  metodo: MetodoHttp;
  indiceLinea: number;
  desdeCaracter: number;
}

function detectarHandlers(lineas: string[]): HandlerDetectado[] {
  const re = new RegExp(
    `^\\s*export\\s+(?:async\\s+function|function|const)\\s+(${METODOS_HTTP.join("|")})\\b`,
  );
  const salida: HandlerDetectado[] = [];
  let offset = 0;
  for (let i = 0; i < lineas.length; i++) {
    const m = re.exec(lineas[i]);
    if (m) salida.push({ metodo: m[1] as MetodoHttp, indiceLinea: i, desdeCaracter: offset });
    offset += lineas[i].length + 1;
  }
  return salida;
}

/**
 * Cuerpo aproximado de un handler: desde su `export` hasta el `export` del
 * siguiente handler (o el fin del archivo). No hace balanceo de llaves a
 * propósito — alcanza para detectar `searchParams.get(...)` y es imposible que
 * se rompa con un `}` dentro de un string.
 */
function cuerpoAproximado(fuente: string, handlers: HandlerDetectado[], i: number): string {
  const desde = handlers[i].desdeCaracter;
  const hasta = i + 1 < handlers.length ? handlers[i + 1].desdeCaracter : fuente.length;
  return fuente.slice(desde, hasta);
}

interface Auth {
  modo: "jwt" | "api-key" | "ninguna";
  verificaFirma: boolean;
  /** "handler" = el propio cuerpo lee el token; "archivo" = lo lee algo del módulo. */
  detectadoEn: "handler" | "archivo";
  detalle: string;
}

/**
 * Autenticación inferida del código. Es una lectura estática: dice qué hace el
 * handler hoy, no qué debería hacer. Que un endpoint salga con modo "ninguna" es
 * información real y es una de las razones por las que este portal es solo-root.
 */
function detectarAuth(fragmento: string, detectadoEn: "handler" | "archivo"): Auth {
  const verificaFirma = /jwt\.verify\s*\(/.test(fragmento);
  if (/["'`]x-api-key["'`]/i.test(fragmento)) {
    return { modo: "api-key", verificaFirma, detectadoEn, detalle: "Header `x-api-key`." };
  }
  const usaToken =
    /\bextractToken\s*\(/.test(fragmento) ||
    /\bresolveUsuario\s*\(/.test(fragmento) ||
    /\brequireRoot\w*\s*\(/.test(fragmento) ||
    /cookies\.get\(\s*["'`]token["'`]/.test(fragmento) ||
    /["'`]authorization["'`]/i.test(fragmento) ||
    /Bearer\s/.test(fragmento);

  if (!usaToken) {
    return {
      modo: "ninguna",
      verificaFirma: false,
      detectadoEn,
      detalle:
        "No se detectó lectura de token: cualquiera con acceso de red al puerto puede llamarlo.",
    };
  }
  return {
    modo: "jwt",
    verificaFirma,
    detectadoEn,
    detalle: verificaFirma
      ? "JWT en `Authorization: Bearer` o cookie `token`, con firma verificada (`jwt.verify`)."
      : "JWT en `Authorization: Bearer` o cookie `token`. La firma NO se verifica: se decodifica el payload y se resuelve el usuario contra la base.",
  };
}

/**
 * Auth de una operación. Se mira primero el cuerpo del handler; si ahí no
 * aparece nada, se cae al archivo completo (el token puede leerse en un helper
 * del mismo módulo) y se deja constancia en `detectadoEn`, para que quien lea el
 * catálogo sepa que ese dato es menos preciso.
 */
function authDeOperacion(cuerpo: string, archivo: string): Auth {
  const enHandler = detectarAuth(cuerpo, "handler");
  if (enHandler.modo !== "ninguna") return enHandler;
  return detectarAuth(archivo, "archivo");
}

function detectarQueryParams(cuerpo: string): string[] {
  const nombres = new Set<string>();
  const re = /searchParams\s*\.\s*(?:get|getAll)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cuerpo)) !== null) nombres.add(m[1]);
  return [...nombres].sort();
}

// ─── Armado del documento OpenAPI ───────────────────────────────────────────

type Operacion = Record<string, unknown>;

function parametrosDeRuta(ruta: string): Operacion[] {
  const nombres = [...ruta.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  return nombres.map((n) => ({
    name: n,
    in: "path",
    required: true,
    schema: { type: "string" },
    description: `Segmento dinámico \`[${n}]\` de la ruta.`,
  }));
}

function parametrosDeQuery(nombres: string[]): Operacion[] {
  return nombres.map((n) => ({
    name: n,
    in: "query",
    required: false,
    schema: { type: "string" },
    description: "Detectado estáticamente (`searchParams.get`); anotalo para describirlo.",
  }));
}

function securityDeAuth(auth: Auth): Operacion[] | undefined {
  if (auth.modo === "api-key") return [{ apiKey: [] }];
  if (auth.modo === "jwt") return [{ bearerJwt: [] }, { cookieToken: [] }];
  return undefined; // sin auth: se omite `security` para que quede evidente
}

/** La entrada única que representa al catch-all `/api/[...proxy]`. */
function entradaProxy(): { ruta: string; item: Record<string, Operacion> } {
  const metodos: MetodoHttp[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  const item: Record<string, Operacion> = {};
  for (const m of metodos) {
    item[m.toLowerCase()] = {
      tags: ["proxy"],
      summary: "Proxy a GeneXus",
      description: [
        "Catch-all que reenvía cualquier request a `BACKEND_BASE_URL`",
        "(GeneXus/Tomcat, `https://sgm.glp.riogas.com.uy/servicios/SecuritySuite` por defecto),",
        "preservando método, query, headers y cuerpo.",
        "",
        "Los endpoints del otro lado son de GeneXus: este catálogo documenta que el proxy",
        "existe y a dónde apunta, no el contrato de cada endpoint remoto.",
        "Se usa para auth, menú y las operaciones legacy de permisos.",
      ].join("\n"),
      operationId: `proxy_${m.toLowerCase()}`,
      parameters: [
        {
          name: "proxy",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Ruta completa a reenviar al backend GeneXus (catch-all `[...proxy]`).",
        },
      ],
      responses: {
        default: { description: "La respuesta del backend GeneXus, tal cual." },
      },
      "x-auth": {
        modo: "passthrough",
        verificaFirma: false,
        detalle: "Los headers viajan sin tocar; autentica GeneXus, no esta app.",
      },
      "x-archivo": "src/app/api/[...proxy]/route.ts",
      "x-generado": true,
    };
  }
  return { ruta: "/api/{proxy}", item };
}

interface ResultadoParseo {
  paths: Record<string, Record<string, Operacion>>;
  modulos: Set<string>;
  cantidad: number;
}

function parsearRepo(): ResultadoParseo {
  const paths: Record<string, Record<string, Operacion>> = {};
  const modulos = new Set<string>();
  let cantidad = 0;

  for (const archivo of listarRoutes(DIR_API)) {
    const rel = path.relative(RAIZ, archivo).split(path.sep).join("/");
    if (EXCLUIDOS.some((e) => e.patron.test(rel))) continue;

    const fuente = fs.readFileSync(archivo, "utf8");
    const lineas = fuente.split(/\r?\n/);
    const handlers = detectarHandlers(lineas);
    if (handlers.length === 0) continue;

    const ruta = pathDesdeArchivo(archivo);
    const modulo = moduloDePath(ruta);
    modulos.add(modulo);

    const cabecera = comentarioDeCabecera(lineas);
    paths[ruta] ??= {};

    handlers.forEach((h, i) => {
      const cuerpo = cuerpoAproximado(fuente, handlers, i);
      const doc = comentarioPrevio(lineas, h.indiceLinea);
      const bloque = doc.length > 0 ? doc : cabecera;
      const auth = authDeOperacion(cuerpo, fuente);
      const security = securityDeAuth(auth);

      const operacion: Operacion = {
        tags: [modulo],
        summary: primeraLinea(bloque) || `${h.metodo} ${ruta}`,
        description: aTexto(bloque),
        operationId: `${h.metodo.toLowerCase()}_${ruta.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
        parameters: [...parametrosDeRuta(ruta), ...parametrosDeQuery(detectarQueryParams(cuerpo))],
        responses: { default: { description: "Sin anotar todavía (ver docs/api/README.md)." } },
        "x-auth": auth,
        "x-archivo": rel,
        "x-generado": true,
      };
      if (security) operacion.security = security;
      if ((operacion.parameters as unknown[]).length === 0) delete operacion.parameters;

      paths[ruta][h.metodo.toLowerCase()] = operacion;
      cantidad++;
    });
  }

  const proxy = entradaProxy();
  paths[proxy.ruta] = proxy.item;
  modulos.add("proxy");
  cantidad += Object.keys(proxy.item).length;

  return { paths, modulos, cantidad };
}

// ─── Serialización determinista ─────────────────────────────────────────────

const ORDEN_METODOS = METODOS_HTTP.map((m) => m.toLowerCase());

function ordenarPaths(
  paths: Record<string, Record<string, Operacion>>,
): Record<string, Record<string, Operacion>> {
  const salida: Record<string, Record<string, Operacion>> = {};
  for (const ruta of Object.keys(paths).sort()) {
    const item: Record<string, Operacion> = {};
    const metodos = Object.keys(paths[ruta]).sort(
      (a, b) => ORDEN_METODOS.indexOf(a) - ORDEN_METODOS.indexOf(b),
    );
    for (const m of metodos) item[m] = paths[ruta][m];
    salida[ruta] = item;
  }
  return salida;
}

function construirDocumento(): Record<string, unknown> {
  const { paths, modulos, cantidad } = parsearRepo();
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8")) as {
    version?: string;
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "SecuritySuite (secapi) — APIs propias",
      version: pkg.version ?? "0.0.0",
      description: [
        "Catálogo generado por `pnpm docs:api` a partir de `src/app/api/**/route.ts`.",
        "",
        "Lo generado describe **lo que el código hace hoy**, incluida la autenticación real de",
        "cada handler. Las descripciones a mano viven en `docs/api/anotaciones.yaml` y ganan",
        "sobre lo inferido; `GET /api/docs/spec` devuelve el documento ya mergeado.",
        "",
        "No editar este archivo a mano: se regenera.",
      ].join("\n"),
    },
    servers: [
      { url: "http://localhost:4005", description: "desarrollo local (pnpm dev)" },
      { url: "https://secapi.riogas.com.uy", description: "secapi (PM2, puerto 3001)" },
    ],
    tags: [...modulos].sort().map((nombre) => ({ name: nombre })),
    components: {
      securitySchemes: {
        bearerJwt: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "JWT emitido por `POST /api/db/login`. Payload: `{ iss, username, userId, sistema }` — no lleva el flag root.",
        },
        cookieToken: {
          type: "apiKey",
          in: "cookie",
          name: "token",
          description: "El mismo JWT, tomado de la cookie `token` cuando no hay header.",
        },
        apiKey: { type: "apiKey", in: "header", name: "x-api-key" },
      },
    },
    paths: ordenarPaths(paths),
    "x-generado-por": "pnpm docs:api (scripts/generar-openapi.ts)",
    "x-aplicacion-id": 1,
    "x-operaciones": cantidad,
    "x-excluidos": EXCLUIDOS.map((e) => ({ patron: e.patron.source, motivo: e.motivo })),
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  const doc = construirDocumento();
  const json = JSON.stringify(doc, null, 2) + "\n";

  if (process.argv.includes("--check")) {
    // Se comparan los saltos de línea normalizados: con `core.autocrlf=true`
    // (Windows) el archivo del working tree queda en CRLF y el generado en LF,
    // y esa diferencia no es un cambio de contenido.
    const leido = fs.existsSync(SALIDA) ? fs.readFileSync(SALIDA, "utf8") : "";
    const actual = leido.replace(/\r\n/g, "\n");
    if (actual !== json) {
      console.error("✗ docs/api/openapi.json está desactualizado. Corré: pnpm docs:api");
      process.exit(1);
    }
    console.log("✓ docs/api/openapi.json está al día.");
    return;
  }

  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, json, "utf8");

  const rutas = Object.keys(doc.paths as object).length;
  console.log(`✓ docs/api/openapi.json — ${rutas} rutas, ${doc["x-operaciones"]} operaciones.`);
}

main();
