// =====================================================================
// Núcleo de `POST /api/docs/try` — ejecutar una llamada desde el portal.
// Ver docs/superpowers/specs/2026-08-17-portal-docs-apis-design.md §5.3.
//
// Todo lo que decide vive acá y es puro (sin Next, sin Prisma, sin más red que
// el `fetch` inyectado), para que `scripts/test-docs-try.ts` lo ejercite sin
// levantar el servidor. El route handler solo aporta el gate root, el origen y
// el token de la sesión.
//
// ── Lo que este módulo NO es ────────────────────────────────────────────────
// NO es un proxy. Ejecuta única y exclusivamente contra el propio origen de la
// app y contra rutas que empiecen con `/api/`. Cualquier intento de salir de
// ahí —URL absoluta, `//otro-host`, `..`, `%2e%2e`, backslashes— se rechaza
// antes de construir la URL, y la URL ya armada se vuelve a comparar contra el
// origen de confianza antes de disparar el fetch.
//
// Ese origen NUNCA sale de un header del request (`Host`, `x-forwarded-host`,
// `Origin`, `Referer`): los controla el cliente, y con uno de ellos el ejecutor
// se convertiría en un SSRF con la sesión del root adentro. Lo resuelve
// `try-handler.ts` con `DOCS_TRY_ORIGEN` o con el loopback del propio proceso.
//
// ── Por qué el pedido viaja en base64 ───────────────────────────────────────
// El WAF de nginx de TrackMovil inspecciona el cuerpo del request entrante y
// devuelve 403 ante ciertos patrones de shell. Un ejemplo de `curl` pegado en
// el formulario los tiene. Codificar el pedido lo hace atravesar el WAF sin que
// ninguna de las tres apps tenga que aflojar su configuración de nginx. No es
// ofuscación ni seguridad: es transporte. El contrato es idéntico en las tres.
// =====================================================================

/** Tope de la respuesta que se devuelve al navegador. Lo que sobra se corta. */
export const TOPE_CUERPO_BYTES = 1024 * 1024; // 1 MB

/** Timeout de la llamada ejecutada. */
export const TIMEOUT_MS = 30_000;

export const METODOS_PERMITIDOS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;
export type MetodoTry = (typeof METODOS_PERMITIDOS)[number];

/** Los que escriben. Exigen confirmación escrita del path (spec §5.3). */
export const METODOS_DE_ESCRITURA: readonly string[] = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * Headers que el cliente NO puede mandar, pase lo que pase.
 *
 * `authorization` y `cookie` los pone el servidor con la sesión del root que
 * está mirando el portal: si el cliente pudiera elegirlos, el endpoint dejaría
 * de ser "probá con tu sesión" y pasaría a ser "mandá la credencial que quieras
 * a cualquier ruta interna". El resto son headers de transporte o de identidad
 * que o los maneja `fetch`, o mienten sobre quién originó el request.
 */
export const HEADERS_PROHIBIDOS: readonly string[] = [
  "authorization",
  "cookie",
  "cookie2",
  "set-cookie",
  "host",
  "connection",
  "keep-alive",
  "content-length",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "expect",
  "origin",
  "referer",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-real-ip",
];

/**
 * Headers de la RESPUESTA que nunca se devuelven al navegador.
 *
 * `set-cookie` es una credencial recién emitida, no un dato documental — y esta
 * app es la que **emite los tokens de todo el ecosistema**: probar
 * `POST /api/db/login` desde el portal devolvería el JWT nuevo en el cuerpo que
 * pinta la pantalla, listo para quedar en una captura, en el historial del
 * navegador o en el portapapeles del botón "copiar". Se filtra acá, del lado
 * del servidor, y no en el visor: lo que no sale del proceso no se puede
 * filtrar después. `set-cookie2` es el nombre del RFC 2965: obsoleto, pero
 * cuesta cero y goya y trackmovil también lo cubren.
 */
export const HEADERS_RESPUESTA_OCULTOS: ReadonlySet<string> = new Set([
  "set-cookie",
  "set-cookie2",
]);

const MAX_HEADERS = 30;
const MAX_LARGO_VALOR_HEADER = 4096;
const RE_NOMBRE_HEADER = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
/**
 * ¿Tiene algún carácter de control? Es por donde se inyectan headers (CR/LF)
 * y por donde se cuelan bytes raros en un path. Se chequea por código y no
 * con un regex para no tener que escribir caracteres invisibles en el fuente.
 */
function tieneCaracterDeControl(valor: string): boolean {
  for (let i = 0; i < valor.length; i++) {
    const codigo = valor.charCodeAt(i);
    if (codigo < 0x20 || codigo === 0x7f) return true;
  }
  return false;
}

/** La propia ruta de este endpoint: llamarse a sí mismo no tiene sentido. */
const RUTA_PROPIA = "/api/docs/try";

// ─── Contratos ──────────────────────────────────────────────────────────────

export type ValorQuery = string | number | boolean | Array<string | number | boolean>;

/** El pedido, tal como viaja adentro del base64. */
export interface PedidoTry {
  metodo: string;
  path: string;
  query?: Record<string, ValorQuery | null | undefined>;
  headers?: Record<string, string>;
  /** Objeto/array → JSON; string → se manda tal cual. Ignorado en GET/HEAD. */
  body?: unknown;
  /** Para escrituras: tiene que ser exactamente el path. */
  confirmacion?: string;
}

export type CodigoTry =
  | "PAYLOAD_FALTANTE" // 400 — no vino `payload`
  | "PAYLOAD_INVALIDO" // 400 — base64 o JSON ilegible
  | "METODO_NO_PERMITIDO" // 400 — método fuera de METODOS_PERMITIDOS
  | "RUTA_INVALIDA" // 400 — vacía, con `#`, con caracteres de control
  | "RUTA_ABSOLUTA" // 400 — http://…, //host, backslashes
  | "RUTA_CON_TRAVERSAL" // 400 — `..` o `%2e`
  | "RUTA_FUERA_DE_API" // 400 — no empieza con /api/
  | "RECURSION_NO_PERMITIDA" // 400 — /api/docs/try llamándose a sí mismo
  | "HEADER_INVALIDO" // 400 — nombre o valor de header inaceptable
  | "DESTINO_FUERA_DE_ORIGEN" // 400 — la URL armada no cayó en el origen de confianza
  | "CONFIRMACION_REQUERIDA" // 428 — escritura sin `confirmacion === path`
  | "ORIGEN_NO_CONFIGURADO" // 503 — el proceso no sabe contra qué origen ejecutar
  | "TIMEOUT" // 504 — pasaron los 30 s
  | "ERROR_DE_RED"; // 502 — la app no contestó

export interface FalloTry {
  ok: false;
  status: number;
  code: CodigoTry;
  detalle?: string;
}

/** Lo que la UI pinta cuando la llamada se ejecutó (haya dado 200 o 500). */
export interface RespuestaTry {
  ok: true;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duracionMs: number;
  truncado: boolean;
}

/** Lo que se deja registrado antes de disparar la llamada. */
export interface EventoAuditoria {
  metodo: string;
  ruta: string;
  esEscritura: boolean;
}

export interface ContextoTry {
  /**
   * Origen de confianza contra el que se ejecuta. NUNCA sale de un header del
   * request: lo resuelve `try-handler.ts` con la env o el loopback del proceso.
   */
  origen: string;
  /** JWT de la sesión del root. Va como Bearer y como cookie `token`. */
  token: string | null;
  /**
   * Rastro de auditoría: se llama una sola vez, ya validado el pedido y justo
   * antes del `fetch`. Queda registro de quién ejecutó qué contra el ambiente
   * real, que es exactamente lo que hay que poder reconstruir después.
   */
  auditar?: (evento: EventoAuditoria) => void;
  /** Inyectable para los tests. */
  fetchImpl?: typeof fetch;
  /** Inyectable para los tests. */
  ahora?: () => number;
  /**
   * Solo para los tests: esperar 30 s reales para verificar que el timeout
   * corta no es un test, es una siesta. En producción nadie lo pasa y rige
   * `TIMEOUT_MS`.
   */
  timeoutMs?: number;
}

// ─── Decodificación del payload ─────────────────────────────────────────────

/**
 * `{ payload: "<base64 de un JSON>" }` → el pedido.
 *
 * Se acepta base64 y base64url: el `btoa` del navegador produce el primero,
 * pero un cliente que arme el payload en Node puede mandar el segundo sin
 * querer, y fallar por eso sería un misterio de los caros. `Buffer.from(…,
 * "base64")` acepta los dos alfabetos.
 */
export function decodificarPayload(entrada: unknown): { ok: true; pedido: PedidoTry } | FalloTry {
  if (!entrada || typeof entrada !== "object") {
    return {
      ok: false,
      status: 400,
      code: "PAYLOAD_FALTANTE",
      detalle: "El cuerpo no es un objeto JSON.",
    };
  }
  const payload = (entrada as Record<string, unknown>).payload;
  if (typeof payload !== "string" || payload.trim() === "") {
    return {
      ok: false,
      status: 400,
      code: "PAYLOAD_FALTANTE",
      detalle: "Falta `payload`: el pedido va en base64 (ver docs/api/README.md).",
    };
  }

  let json: string;
  try {
    json = Buffer.from(payload, "base64").toString("utf8");
  } catch {
    return { ok: false, status: 400, code: "PAYLOAD_INVALIDO", detalle: "`payload` no es base64." };
  }

  let pedido: unknown;
  try {
    pedido = JSON.parse(json);
  } catch {
    return {
      ok: false,
      status: 400,
      code: "PAYLOAD_INVALIDO",
      detalle: "El base64 no contiene un JSON válido.",
    };
  }
  if (!pedido || typeof pedido !== "object" || Array.isArray(pedido)) {
    return {
      ok: false,
      status: 400,
      code: "PAYLOAD_INVALIDO",
      detalle: "El pedido decodificado tiene que ser un objeto.",
    };
  }

  // `confirmacion` se acepta también afuera del base64: es un path, nunca tiene
  // sintaxis que el WAF mire, y así la UI puede mandarla donde le quede cómodo.
  const p = pedido as PedidoTry;
  const afuera = (entrada as Record<string, unknown>).confirmacion;
  if (p.confirmacion === undefined && typeof afuera === "string") p.confirmacion = afuera;

  return { ok: true, pedido: p };
}

// ─── Validación de la ruta ──────────────────────────────────────────────────

export interface RutaValidada {
  ok: true;
  /** El path, sin query string. */
  ruta: string;
  /** La query que venía pegada al path, si venía. */
  queryEnRuta: string;
}

/**
 * La única puerta por la que se construye una URL. Todo lo que no sea un path
 * absoluto de esta misma app bajo `/api/` se rechaza acá.
 *
 * El orden importa: primero se descartan las formas que engañan al parser de
 * URL (backslashes, `//`, esquema) y recién después se mira el prefijo. Al
 * revés, `/api/../../etc` pasaría el `startsWith` y recién fallaría —o no—
 * cuando `new URL()` lo normalizara.
 */
export function validarRuta(entrada: unknown): RutaValidada | FalloTry {
  if (typeof entrada !== "string" || entrada.trim() === "") {
    return { ok: false, status: 400, code: "RUTA_INVALIDA", detalle: "Falta `path`." };
  }
  const cruda = entrada.trim();

  if (tieneCaracterDeControl(cruda)) {
    return {
      ok: false,
      status: 400,
      code: "RUTA_INVALIDA",
      detalle: "El path tiene caracteres de control.",
    };
  }
  if (cruda.includes("#")) {
    return {
      ok: false,
      status: 400,
      code: "RUTA_INVALIDA",
      detalle: "El path no puede traer fragmento (`#`).",
    };
  }

  // ── Cualquier forma de "esto apunta a otro lado" ──
  // `\` porque varios parsers (y los navegadores) lo normalizan a `/`:
  // `/\otro-host` termina siendo `//otro-host`.
  if (cruda.includes("\\")) {
    return { ok: false, status: 400, code: "RUTA_ABSOLUTA", detalle: "El path no puede tener `\\`." };
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(cruda)) {
    return {
      ok: false,
      status: 400,
      code: "RUTA_ABSOLUTA",
      detalle: "Solo se ejecuta contra el propio host: nada de URL absolutas.",
    };
  }
  if (cruda.startsWith("//")) {
    return {
      ok: false,
      status: 400,
      code: "RUTA_ABSOLUTA",
      detalle: "`//host` es una URL a otro host: no se ejecuta.",
    };
  }
  if (!cruda.startsWith("/")) {
    return {
      ok: false,
      status: 400,
      code: "RUTA_ABSOLUTA",
      detalle: "El path tiene que ser absoluto y empezar con `/api/`.",
    };
  }

  const corte = cruda.indexOf("?");
  const soloRuta = corte === -1 ? cruda : cruda.slice(0, corte);
  const queryEnRuta = corte === -1 ? "" : cruda.slice(corte + 1);

  // ── Traversal ──
  // Se mira el crudo y lo percent-encoded: `%2e%2e%2f` es `../` en cuanto lo
  // toque cualquier capa. Rechazar todo `%2e`/`%2f`/`%5c` alcanza y sobra:
  // ningún endpoint real necesita un punto ni una barra codificados en el path.
  const enMinuscula = soloRuta.toLowerCase();
  if (enMinuscula.includes("%2e") || enMinuscula.includes("%2f") || enMinuscula.includes("%5c")) {
    return {
      ok: false,
      status: 400,
      code: "RUTA_CON_TRAVERSAL",
      detalle: "El path tiene puntos o separadores percent-encoded.",
    };
  }
  if (soloRuta.split("/").some((seg) => seg === "..")) {
    return {
      ok: false,
      status: 400,
      code: "RUTA_CON_TRAVERSAL",
      detalle: "El path sale de `/api/` con `..`.",
    };
  }

  if (!(soloRuta === "/api" || soloRuta.startsWith("/api/"))) {
    return {
      ok: false,
      status: 400,
      code: "RUTA_FUERA_DE_API",
      detalle: "Solo se ejecutan rutas bajo `/api/`.",
    };
  }

  const sinBarraFinal = soloRuta.replace(/\/+$/, "") || "/";
  if (sinBarraFinal.toLowerCase() === RUTA_PROPIA) {
    return {
      ok: false,
      status: 400,
      code: "RECURSION_NO_PERMITIDA",
      detalle: "El ejecutor no se llama a sí mismo.",
    };
  }

  return { ok: true, ruta: soloRuta, queryEnRuta };
}

// ─── Método ─────────────────────────────────────────────────────────────────

export function validarMetodo(entrada: unknown): { ok: true; metodo: MetodoTry } | FalloTry {
  const metodo = typeof entrada === "string" ? entrada.trim().toUpperCase() : "";
  if (!(METODOS_PERMITIDOS as readonly string[]).includes(metodo)) {
    return {
      ok: false,
      status: 400,
      code: "METODO_NO_PERMITIDO",
      detalle: `Método no soportado. Permitidos: ${METODOS_PERMITIDOS.join(", ")}.`,
    };
  }
  return { ok: true, metodo: metodo as MetodoTry };
}

export function esEscritura(metodo: string): boolean {
  return METODOS_DE_ESCRITURA.includes(metodo.toUpperCase());
}

// ─── Headers ────────────────────────────────────────────────────────────────

export interface HeadersSaneados {
  ok: true;
  headers: Record<string, string>;
  /** Los que el cliente mandó y no se reenvían. La UI los muestra. */
  descartados: string[];
}

/**
 * Deja pasar solo headers de contenido. Los de la lista negra se descartan y se
 * informan, sin rechazar el pedido: que un ejemplo pegado en el formulario
 * traiga un `Authorization:` de muestra es lo normal, y hacerlo fallar por eso
 * sería pedante. Un nombre o un valor mal formado sí corta: eso es inyección.
 */
export function sanearHeaders(entrada: unknown): HeadersSaneados | FalloTry {
  const headers: Record<string, string> = {};
  const descartados: string[] = [];
  if (entrada === undefined || entrada === null) return { ok: true, headers, descartados };
  if (typeof entrada !== "object" || Array.isArray(entrada)) {
    return {
      ok: false,
      status: 400,
      code: "HEADER_INVALIDO",
      detalle: "`headers` tiene que ser un objeto.",
    };
  }

  const pares = Object.entries(entrada as Record<string, unknown>);
  if (pares.length > MAX_HEADERS) {
    return {
      ok: false,
      status: 400,
      code: "HEADER_INVALIDO",
      detalle: `Demasiados headers (${pares.length} > ${MAX_HEADERS}).`,
    };
  }

  for (const [nombreCrudo, valorCrudo] of pares) {
    const nombre = nombreCrudo.trim().toLowerCase();
    if (!RE_NOMBRE_HEADER.test(nombre)) {
      return {
        ok: false,
        status: 400,
        code: "HEADER_INVALIDO",
        detalle: `Nombre de header inválido: ${JSON.stringify(nombreCrudo)}.`,
      };
    }
    if (HEADERS_PROHIBIDOS.includes(nombre)) {
      descartados.push(nombre);
      continue;
    }
    if (valorCrudo === undefined || valorCrudo === null) continue;
    const valor = String(valorCrudo);
    if (tieneCaracterDeControl(valor)) {
      return {
        ok: false,
        status: 400,
        code: "HEADER_INVALIDO",
        detalle: `El header \`${nombre}\` tiene caracteres de control.`,
      };
    }
    if (valor.length > MAX_LARGO_VALOR_HEADER) {
      return {
        ok: false,
        status: 400,
        code: "HEADER_INVALIDO",
        detalle: `El header \`${nombre}\` es demasiado largo.`,
      };
    }
    headers[nombre] = valor;
  }

  return { ok: true, headers, descartados: descartados.sort() };
}

// ─── URL ────────────────────────────────────────────────────────────────────

/**
 * Arma la URL final y **la vuelve a validar contra el origen de confianza**.
 *
 * `origen` no sale de ningún header del request (ver `try-handler.ts`): es la
 * env `DOCS_TRY_ORIGEN` o el loopback del propio proceso. Esa es la única cosa
 * que define el host, y la ruta —que ya pasó por `validarRuta`— no puede
 * cambiarlo.
 *
 * La segunda comprobación no es redundante: `validarRuta` mira texto, y el
 * parser de URL puede interpretar una forma rara distinto de como se leyó. Acá
 * se compara lo que `new URL()` resolvió de verdad contra el origen de
 * confianza —no contra una base que armó el cliente, que sería comparar algo
 * consigo mismo y no probaría nada—. Si el destino no cayó exactamente ahí, no
 * se ejecuta.
 */
export function construirUrl(
  origen: string,
  ruta: string,
  queryEnRuta: string,
  query?: PedidoTry["query"],
): { ok: true; url: string } | FalloTry {
  let confianza: URL;
  try {
    confianza = new URL(origen);
  } catch {
    return {
      ok: false,
      status: 503,
      code: "ORIGEN_NO_CONFIGURADO",
      detalle: "El servidor no pudo resolver su propio origen (ver docs/api/README.md).",
    };
  }
  if (confianza.protocol !== "http:" && confianza.protocol !== "https:") {
    return {
      ok: false,
      status: 503,
      code: "ORIGEN_NO_CONFIGURADO",
      detalle: "El origen de confianza tiene que ser http o https.",
    };
  }

  let url: URL;
  try {
    url = new URL(ruta, confianza);
  } catch {
    return { ok: false, status: 400, code: "RUTA_INVALIDA", detalle: "El path no forma una URL." };
  }

  // La red de seguridad: se compara el destino ya resuelto contra el origen de
  // confianza, no contra una base que armó el cliente.
  if (url.origin !== confianza.origin) {
    return {
      ok: false,
      status: 400,
      code: "DESTINO_FUERA_DE_ORIGEN",
      detalle: "El destino quedó fuera del origen de la app: no se ejecuta.",
    };
  }
  // La ruta ya normalizada por el parser: si acá no arranca con /api/, es que
  // algo la movió después de `validarRuta`.
  if (!(url.pathname === "/api" || url.pathname.startsWith("/api/"))) {
    return {
      ok: false,
      status: 400,
      code: "RUTA_FUERA_DE_API",
      detalle: "Solo se ejecutan rutas bajo `/api/`.",
    };
  }

  // Y el mismo criterio para la recursión. `validarRuta` la bloquea sobre el
  // TEXTO que mandó el cliente, pero `new URL` resuelve los segmentos punto
  // (RFC 3986): `/api/docs/./try` pasa el filtro textual y aterriza igual en
  // `/api/docs/try`. Lo que vale es el path que se va a pedir, no el que se
  // escribió.
  const pathResuelto = url.pathname.replace(/\/+$/, "").toLowerCase() || "/";
  if (pathResuelto === RUTA_PROPIA) {
    return {
      ok: false,
      status: 400,
      code: "RECURSION_NO_PERMITIDA",
      detalle: "El ejecutor no se llama a sí mismo.",
    };
  }

  if (queryEnRuta) {
    for (const [k, v] of new URLSearchParams(queryEnRuta)) url.searchParams.append(k, v);
  }
  for (const [clave, valor] of Object.entries(query ?? {})) {
    if (valor === null || valor === undefined) continue;
    if (Array.isArray(valor)) {
      for (const v of valor) url.searchParams.append(clave, String(v));
    } else {
      url.searchParams.append(clave, String(valor));
    }
  }
  return { ok: true, url: url.toString() };
}

// ─── Cuerpo ─────────────────────────────────────────────────────────────────

function serializarCuerpo(body: unknown, headers: Record<string, string>): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") {
    if (body === "") return undefined;
    if (!headers["content-type"]) headers["content-type"] = "application/json";
    return body;
  }
  if (!headers["content-type"]) headers["content-type"] = "application/json";
  return JSON.stringify(body);
}

/** Lee la respuesta cortando en el tope, sin materializar de más en memoria. */
async function leerCuerpoAcotado(res: Response): Promise<{ texto: string; truncado: boolean }> {
  if (!res.body) {
    const texto = await res.text();
    return texto.length > TOPE_CUERPO_BYTES
      ? { texto: texto.slice(0, TOPE_CUERPO_BYTES), truncado: true }
      : { texto, truncado: false };
  }

  const lector = res.body.getReader();
  const trozos: Buffer[] = [];
  let total = 0;
  let truncado = false;

  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    if (!value) continue;
    const restante = TOPE_CUERPO_BYTES - total;
    // `>` y no `>=`: un cuerpo de exactamente 1 MB entra entero y no se
    // reporta como truncado. Si viene más, el próximo chunk corta con restante 0.
    if (value.byteLength > restante) {
      trozos.push(Buffer.from(value.subarray(0, restante)));
      truncado = true;
      await lector.cancel().catch(() => {});
      break;
    }
    trozos.push(Buffer.from(value));
    total += value.byteLength;
  }

  return { texto: Buffer.concat(trozos).toString("utf8"), truncado };
}

// ─── Ejecución ──────────────────────────────────────────────────────────────

/**
 * El camino completo: decodificar, validar, confirmar si escribe, ejecutar.
 *
 * Devuelve `FalloTry` (la llamada NO se hizo) o `RespuestaTry` (se hizo, con el
 * status que haya dado). Un 500 del endpoint probado es un resultado, no un
 * fallo de este endpoint.
 */
export async function ejecutarTry(
  entrada: unknown,
  contexto: ContextoTry,
): Promise<FalloTry | RespuestaTry> {
  const decodificado = decodificarPayload(entrada);
  if (!decodificado.ok) return decodificado;
  const pedido = decodificado.pedido;

  const metodo = validarMetodo(pedido.metodo);
  if (!metodo.ok) return metodo;

  const ruta = validarRuta(pedido.path);
  if (!ruta.ok) return ruta;

  // Confirmación: el path escrito a mano, exacto, para todo lo que escribe.
  // Se compara contra la ruta sin query, que es lo que la UI muestra y lo que
  // el usuario tiene delante mientras lo tipea.
  if (esEscritura(metodo.metodo) && pedido.confirmacion !== ruta.ruta) {
    return {
      ok: false,
      status: 428,
      code: "CONFIRMACION_REQUERIDA",
      detalle: `Para ejecutar ${metodo.metodo} hay que confirmar escribiendo el path exacto: ${ruta.ruta}`,
    };
  }

  const saneados = sanearHeaders(pedido.headers);
  if (!saneados.ok) return saneados;
  const headers = saneados.headers;

  const cuerpo =
    metodo.metodo === "GET" || metodo.metodo === "HEAD"
      ? undefined
      : serializarCuerpo(pedido.body, headers);

  // La sesión la pone el servidor, y siempre después de sanear: así ningún
  // header del cliente puede pisarla.
  if (contexto.token) {
    headers.authorization = `Bearer ${contexto.token}`;
    headers.cookie = `token=${contexto.token}`;
  }

  const destino = construirUrl(contexto.origen, ruta.ruta, ruta.queryEnRuta, pedido.query);
  if (!destino.ok) return destino;
  const url = destino.url;

  // Después del guard (lo corre el manejador) y antes del fetch: si algo sale
  // mal, el log ya dice quién lo disparó y contra qué.
  contexto.auditar?.({
    metodo: metodo.metodo,
    ruta: ruta.ruta,
    esEscritura: esEscritura(metodo.metodo),
  });

  const doFetch = contexto.fetchImpl ?? fetch;
  const reloj = contexto.ahora ?? (() => Date.now());
  const arranque = reloj();

  const abortador = new AbortController();
  const limite = contexto.timeoutMs ?? TIMEOUT_MS;
  const cronometro = setTimeout(() => abortador.abort(), limite);

  let res: Response;
  try {
    res = await doFetch(url, {
      method: metodo.metodo,
      headers,
      body: cuerpo,
      signal: abortador.signal,
      redirect: "manual", // un 3xx a otro host no se sigue: se muestra y listo
      cache: "no-store",
    });
  } catch (error) {
    const abortado = abortador.signal.aborted;
    return {
      ok: false,
      status: abortado ? 504 : 502,
      code: abortado ? "TIMEOUT" : "ERROR_DE_RED",
      detalle: abortado
        ? `La llamada superó los ${limite / 1000} s y se abortó.`
        : `No se pudo ejecutar: ${(error as Error)?.message ?? "error desconocido"}`,
    };
  } finally {
    clearTimeout(cronometro);
  }

  let texto = "";
  let truncado = false;
  try {
    const leido = await leerCuerpoAcotado(res);
    texto = leido.texto;
    truncado = leido.truncado;
  } catch (error) {
    texto = `[no se pudo leer el cuerpo: ${(error as Error)?.message ?? "error desconocido"}]`;
  }

  const cabeceras: Record<string, string> = {};
  res.headers.forEach((valor, clave) => {
    // `set-cookie` no sube al navegador: ver HEADERS_RESPUESTA_OCULTOS.
    if (HEADERS_RESPUESTA_OCULTOS.has(clave.toLowerCase())) return;
    cabeceras[clave] = valor;
  });
  if (saneados.descartados.length > 0) {
    cabeceras["x-docs-try-headers-descartados"] = saneados.descartados.join(", ");
  }

  return {
    ok: true,
    status: res.status,
    statusText: res.statusText,
    headers: cabeceras,
    body: texto,
    duracionMs: reloj() - arranque,
    truncado,
  };
}
