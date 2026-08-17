/**
 * scripts/test-docs-try.ts
 *
 * Test del ejecutor del "Try it" del portal `/docs`:
 *   - src/lib/docs/try-request.ts  (validación y ejecución)
 *   - src/lib/docs/try-handler.ts  (el gate y el armado del contexto)
 *
 * Mismo formato que scripts/test-docs-root-guard.ts: script `tsx` con sus
 * propias aserciones, sin runner. Se corre con:
 *
 *   pnpm test          (junto con el resto)
 *   pnpm test:docs-try
 *
 * NO toca la base ni la red: el guard y el `fetch` se inyectan. Lo que se
 * verifica es que **nunca** se construya una llamada fuera de este host, que
 * ninguna escritura salga sin confirmación, y que sin ser root no se ejecute
 * absolutamente nada.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  ejecutarTry,
  sanearHeaders,
  validarRuta,
  TOPE_CUERPO_BYTES,
  type FalloTry,
  type RespuestaTry,
} from "../src/lib/docs/try-request";
import { crearManejadorTry } from "../src/lib/docs/try-handler";
import type { ResultadoGuard } from "../src/lib/docs/root-guard";

// ─── Mini framework de aserciones ───────────────────────────────────────────

let pasaron = 0;
const fallaron: string[] = [];

async function test(nombre: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    pasaron++;
    console.log(`  ✓ ${nombre}`);
  } catch (error) {
    fallaron.push(nombre);
    console.log(`  ✗ ${nombre}`);
    console.log(`      ${(error as Error).message}`);
  }
}

function esperar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(mensaje);
}

function esperarIgual(actual: unknown, esperado: unknown, que: string): void {
  if (actual !== esperado) {
    throw new Error(`${que}: esperaba ${JSON.stringify(esperado)}, vino ${JSON.stringify(actual)}`);
  }
}

function esperarFallo(r: FalloTry | RespuestaTry, status: number, code: string): void {
  esperar(!r.ok, `esperaba fallo ${code}, pero la llamada se ejecutó`);
  if (r.ok) return;
  esperarIgual(r.status, status, "status");
  esperarIgual(r.code, code, "code");
}

// ─── Dobles ─────────────────────────────────────────────────────────────────

const ORIGEN = "http://localhost:4005";
const TOKEN = "jwt.de.prueba";

interface LlamadaFetch {
  url: string;
  init: RequestInit;
}

/** `fetch` falso: registra lo que se le pidió y devuelve lo que se le indique. */
function fetchEspia(opciones: { status?: number; cuerpo?: string; headers?: HeadersInit } = {}) {
  const llamadas: LlamadaFetch[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    return new Response(opciones.cuerpo ?? '{"ok":true}', {
      status: opciones.status ?? 200,
      statusText: opciones.status === 201 ? "Created" : "OK",
      headers: opciones.headers ?? { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, llamadas };
}

/** `fetch` que nunca contesta: sirve para ejercitar el abort del timeout. */
const fetchQueNuncaContesta = ((url: string | URL | Request, init?: RequestInit) => {
  return new Promise<Response>((_resolver, rechazar) => {
    const senal = init?.signal;
    senal?.addEventListener("abort", () => {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      rechazar(error);
    });
  });
}) as unknown as typeof fetch;

/** El pedido, tal como lo manda la UI: base64 de un JSON. */
function payloadDe(pedido: Record<string, unknown>): { payload: string } {
  return { payload: Buffer.from(JSON.stringify(pedido), "utf8").toString("base64") };
}

function contexto(fetchImpl: typeof fetch) {
  return { origen: ORIGEN, token: TOKEN, fetchImpl };
}

function headersDe(llamada: LlamadaFetch): Record<string, string> {
  return (llamada.init.headers ?? {}) as Record<string, string>;
}

/** Request al endpoint, para los tests del manejador. */
function requestTry(cuerpo: unknown): NextRequest {
  return new NextRequest(`${ORIGEN}/api/docs/try`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(cuerpo),
  });
}

const GUARD_OK: ResultadoGuard = {
  ok: true,
  usuario: { id: 1, esRoot: "S", username: "dmedaglia" },
};
const GUARD_NO_ROOT: ResultadoGuard = { ok: false, status: 403, code: "NO_ROOT" };

async function main(): Promise<void> {
  console.log("\ntry-request — destino permitido\n");

  // ── Lo que NO se ejecuta jamás ────────────────────────────────────────────

  await test("un path fuera de /api se rechaza y no se llama a nada", async () => {
    const f = fetchEspia();
    const r = await ejecutarTry(
      payloadDe({ metodo: "GET", path: "/dashboard/usuarios" }),
      contexto(f.impl),
    );
    esperarFallo(r, 400, "RUTA_FUERA_DE_API");
    esperarIgual(f.llamadas.length, 0, "llamadas al fetch");
  });

  await test("una URL absoluta se rechaza (no es un proxy abierto)", async () => {
    const f = fetchEspia();
    for (const path of [
      "https://evil.example.com/api/db/usuarios",
      "http://192.168.2.117:5432/api/x",
      "file:///etc/passwd",
    ]) {
      const r = await ejecutarTry(payloadDe({ metodo: "GET", path }), contexto(f.impl));
      esperarFallo(r, 400, "RUTA_ABSOLUTA");
    }
    esperarIgual(f.llamadas.length, 0, "llamadas al fetch");
  });

  await test("`//host` (protocol-relative) se rechaza", async () => {
    const f = fetchEspia();
    const r = await ejecutarTry(
      payloadDe({ metodo: "GET", path: "//evil.example.com/api/db/usuarios" }),
      contexto(f.impl),
    );
    esperarFallo(r, 400, "RUTA_ABSOLUTA");
    esperarIgual(f.llamadas.length, 0, "llamadas al fetch");
  });

  await test("un backslash se rechaza: varios parsers lo normalizan a `/`", async () => {
    const r = validarRuta("/\\evil.example.com/api/x");
    esperarFallo(r as FalloTry, 400, "RUTA_ABSOLUTA");
  });

  await test("el path traversal se rechaza, crudo y percent-encoded", async () => {
    const f = fetchEspia();
    for (const path of [
      "/api/../../etc/passwd",
      "/api/db/../../secreto",
      "/api/%2e%2e/%2e%2e/etc",
      "/api/db/%2E%2E/x",
      "/api/db%2Fusuarios",
    ]) {
      const r = await ejecutarTry(payloadDe({ metodo: "GET", path }), contexto(f.impl));
      esperar(!r.ok, `${path} tendría que rechazarse`);
      if (!r.ok) {
        esperar(
          r.code === "RUTA_CON_TRAVERSAL" || r.code === "RUTA_ABSOLUTA",
          `${path}: código inesperado ${r.code}`,
        );
      }
    }
    esperarIgual(f.llamadas.length, 0, "llamadas al fetch");
  });

  await test("no se llama a sí mismo", async () => {
    const f = fetchEspia();
    const r = await ejecutarTry(
      payloadDe({ metodo: "POST", path: "/api/docs/try", confirmacion: "/api/docs/try" }),
      contexto(f.impl),
    );
    esperarFallo(r, 400, "RECURSION_NO_PERMITIDA");
    esperarIgual(f.llamadas.length, 0, "llamadas al fetch");
  });

  await test("un método fuera de la lista se rechaza", async () => {
    const f = fetchEspia();
    const r = await ejecutarTry(
      payloadDe({ metodo: "TRACE", path: "/api/db/usuarios" }),
      contexto(f.impl),
    );
    esperarFallo(r, 400, "METODO_NO_PERMITIDO");
    esperarIgual(f.llamadas.length, 0, "llamadas al fetch");
  });

  await test("un payload que no es base64 de un JSON se rechaza", async () => {
    const f = fetchEspia();
    esperarFallo(await ejecutarTry({}, contexto(f.impl)), 400, "PAYLOAD_FALTANTE");
    esperarFallo(
      await ejecutarTry({ payload: "no-es-json-valido" }, contexto(f.impl)),
      400,
      "PAYLOAD_INVALIDO",
    );
    esperarFallo(
      await ejecutarTry(
        { payload: Buffer.from('["array"]').toString("base64") },
        contexto(f.impl),
      ),
      400,
      "PAYLOAD_INVALIDO",
    );
    esperarIgual(f.llamadas.length, 0, "llamadas al fetch");
  });

  console.log("\ntry-request — confirmación de las escrituras\n");

  await test("POST sin confirmación devuelve 428", async () => {
    const f = fetchEspia();
    const r = await ejecutarTry(
      payloadDe({ metodo: "POST", path: "/api/db/roles", body: { nombre: "x" } }),
      contexto(f.impl),
    );
    esperarFallo(r, 428, "CONFIRMACION_REQUERIDA");
    esperarIgual(f.llamadas.length, 0, "llamadas al fetch");
  });

  await test("PUT, PATCH y DELETE también exigen confirmación", async () => {
    const f = fetchEspia();
    for (const metodo of ["PUT", "PATCH", "DELETE"]) {
      const r = await ejecutarTry(
        payloadDe({ metodo, path: "/api/db/roles/1" }),
        contexto(f.impl),
      );
      esperarFallo(r, 428, "CONFIRMACION_REQUERIDA");
    }
    esperarIgual(f.llamadas.length, 0, "llamadas al fetch");
  });

  await test("una confirmación que no es el path exacto no alcanza", async () => {
    const f = fetchEspia();
    for (const confirmacion of ["/api/db/roles/", "api/db/roles", "/API/DB/ROLES", "sí"]) {
      const r = await ejecutarTry(
        payloadDe({ metodo: "POST", path: "/api/db/roles", confirmacion }),
        contexto(f.impl),
      );
      esperarFallo(r, 428, "CONFIRMACION_REQUERIDA");
    }
    esperarIgual(f.llamadas.length, 0, "llamadas al fetch");
  });

  await test("con la confirmación correcta, la escritura se ejecuta", async () => {
    const f = fetchEspia({ status: 201, cuerpo: '{"id":9}' });
    const r = await ejecutarTry(
      payloadDe({
        metodo: "POST",
        path: "/api/db/roles",
        body: { nombre: "Root (copia)" },
        confirmacion: "/api/db/roles",
      }),
      contexto(f.impl),
    );
    esperar(r.ok, "tendría que haberse ejecutado");
    if (!r.ok) return;
    esperarIgual(r.status, 201, "status del endpoint probado");
    esperarIgual(r.body, '{"id":9}', "cuerpo devuelto");
    esperarIgual(f.llamadas.length, 1, "llamadas al fetch");
    esperarIgual(f.llamadas[0].url, `${ORIGEN}/api/db/roles`, "url");
    esperarIgual(f.llamadas[0].init.method, "POST", "método");
    esperarIgual(f.llamadas[0].init.body, '{"nombre":"Root (copia)"}', "cuerpo enviado");
  });

  await test("la confirmación se compara contra el path sin la query", async () => {
    const f = fetchEspia();
    const r = await ejecutarTry(
      payloadDe({
        metodo: "DELETE",
        path: "/api/db/accesos?usuarioId=3",
        confirmacion: "/api/db/accesos",
      }),
      contexto(f.impl),
    );
    esperar(r.ok, "tendría que ejecutarse: la confirmación es el path, no la URL");
    esperarIgual(f.llamadas[0]?.url, `${ORIGEN}/api/db/accesos?usuarioId=3`, "url");
  });

  console.log("\ntry-request — ejecución\n");

  await test("un GET se ejecuta directo, sin confirmación", async () => {
    const f = fetchEspia({ cuerpo: '{"roles":[]}' });
    const r = await ejecutarTry(
      payloadDe({ metodo: "GET", path: "/api/db/roles" }),
      contexto(f.impl),
    );
    esperar(r.ok, "el GET tendría que ejecutarse");
    if (!r.ok) return;
    esperarIgual(r.status, 200, "status");
    esperarIgual(r.body, '{"roles":[]}', "cuerpo");
    esperarIgual(r.truncado, false, "truncado");
    esperar(typeof r.duracionMs === "number", "tiene que informar la duración");
    esperarIgual(f.llamadas[0].init.body, undefined, "un GET no lleva cuerpo");
  });

  await test("HEAD tampoco pide confirmación y no manda cuerpo", async () => {
    const f = fetchEspia();
    const r = await ejecutarTry(
      payloadDe({ metodo: "HEAD", path: "/api/db/roles", body: { a: 1 } }),
      contexto(f.impl),
    );
    esperar(r.ok, "el HEAD tendría que ejecutarse");
    esperarIgual(f.llamadas[0].init.body, undefined, "HEAD sin cuerpo");
  });

  await test("la query del objeto y la del path se combinan", async () => {
    const f = fetchEspia();
    await ejecutarTry(
      payloadDe({
        metodo: "GET",
        path: "/api/db/usuarios?estado=A",
        query: { page: 2, tags: ["a", "b"], vacio: null },
      }),
      contexto(f.impl),
    );
    const url = new URL(f.llamadas[0].url);
    esperarIgual(url.origin, ORIGEN, "origen");
    esperarIgual(url.searchParams.get("estado"), "A", "query del path");
    esperarIgual(url.searchParams.get("page"), "2", "query del objeto");
    esperarIgual(url.searchParams.getAll("tags").join(","), "a,b", "query repetida");
    esperar(!url.searchParams.has("vacio"), "un null no se manda");
  });

  await test("el origen manda: el host nunca sale del contexto", async () => {
    const f = fetchEspia();
    await ejecutarTry(
      payloadDe({ metodo: "GET", path: "/api/db/roles" }),
      { origen: "https://secapi.riogas.com.uy", token: null, fetchImpl: f.impl },
    );
    esperarIgual(f.llamadas[0].url, "https://secapi.riogas.com.uy/api/db/roles", "url");
  });

  console.log("\ntry-request — headers\n");

  await test("el servidor pone la sesión: authorization y cookie", async () => {
    const f = fetchEspia();
    await ejecutarTry(payloadDe({ metodo: "GET", path: "/api/db/roles" }), contexto(f.impl));
    const h = headersDe(f.llamadas[0]);
    esperarIgual(h.authorization, `Bearer ${TOKEN}`, "authorization");
    esperarIgual(h.cookie, `token=${TOKEN}`, "cookie");
  });

  await test("el cliente NO puede pisar authorization ni cookie", async () => {
    const f = fetchEspia();
    const r = await ejecutarTry(
      payloadDe({
        metodo: "GET",
        path: "/api/db/roles",
        headers: {
          Authorization: "Bearer TOKEN-DE-OTRO",
          Cookie: "token=TOKEN-DE-OTRO",
          Host: "evil.example.com",
          "X-Forwarded-For": "1.2.3.4",
          "content-length": "999",
        },
      }),
      contexto(f.impl),
    );
    const h = headersDe(f.llamadas[0]);
    esperarIgual(h.authorization, `Bearer ${TOKEN}`, "authorization");
    esperarIgual(h.cookie, `token=${TOKEN}`, "cookie");
    esperarIgual(h.host, undefined, "host");
    esperarIgual(h["x-forwarded-for"], undefined, "x-forwarded-for");
    esperarIgual(h["content-length"], undefined, "content-length");
    esperar(r.ok, "descartar headers no rompe el pedido");
    if (r.ok) {
      esperar(
        (r.headers["x-docs-try-headers-descartados"] ?? "").includes("authorization"),
        "los descartados se informan en la respuesta",
      );
    }
  });

  await test("un header propio sí pasa", async () => {
    const f = fetchEspia();
    await ejecutarTry(
      payloadDe({ metodo: "GET", path: "/api/db/roles", headers: { "X-Mi-Header": "valor" } }),
      contexto(f.impl),
    );
    esperarIgual(headersDe(f.llamadas[0])["x-mi-header"], "valor", "header propio");
  });

  await test("un header con CRLF se rechaza (inyección)", () => {
    const r = sanearHeaders({ "x-malo": "valor\r\nX-Inyectado: si" });
    esperarFallo(r as FalloTry, 400, "HEADER_INVALIDO");
  });

  await test("un nombre de header mal formado se rechaza", () => {
    const r = sanearHeaders({ "x malo": "valor" });
    esperarFallo(r as FalloTry, 400, "HEADER_INVALIDO");
  });

  console.log("\ntry-request — límites\n");

  await test("la respuesta se trunca a 1 MB", async () => {
    const grande = "x".repeat(TOPE_CUERPO_BYTES + 5000);
    const f = fetchEspia({ cuerpo: grande, headers: { "content-type": "text/plain" } });
    const r = await ejecutarTry(
      payloadDe({ metodo: "GET", path: "/api/db/roles" }),
      contexto(f.impl),
    );
    esperar(r.ok, "tendría que ejecutarse");
    if (!r.ok) return;
    esperarIgual(r.truncado, true, "truncado");
    esperarIgual(Buffer.byteLength(r.body, "utf8"), TOPE_CUERPO_BYTES, "bytes devueltos");
  });

  await test("un cuerpo chico no se marca como truncado", async () => {
    const f = fetchEspia({ cuerpo: "hola" });
    const r = await ejecutarTry(
      payloadDe({ metodo: "GET", path: "/api/db/roles" }),
      contexto(f.impl),
    );
    esperar(r.ok && r.truncado === false, "no tendría que estar truncado");
  });

  await test("el timeout corta la llamada y la reporta como TIMEOUT (504)", async () => {
    // Con `timeoutMs` chico: esperar los 30 s reales no sería un test, sería una
    // siesta. Lo que se ejercita es el mismo camino — el AbortController del
    // ejecutor dispara, el fetch rechaza con AbortError, y el código resultante
    // distingue el timeout de un error de red cualquiera.
    const r = await ejecutarTry(payloadDe({ metodo: "GET", path: "/api/db/roles" }), {
      origen: ORIGEN,
      token: TOKEN,
      fetchImpl: fetchQueNuncaContesta,
      timeoutMs: 25,
    });
    esperarFallo(r, 504, "TIMEOUT");
  });

  await test("si la app no contesta, es ERROR_DE_RED y no una excepción", async () => {
    const impl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const r = await ejecutarTry(payloadDe({ metodo: "GET", path: "/api/db/roles" }), {
      origen: ORIGEN,
      token: TOKEN,
      fetchImpl: impl,
    });
    esperarFallo(r, 502, "ERROR_DE_RED");
  });

  console.log("\ntry-handler — el gate\n");

  await test("sin ser root: 403 y no se ejecuta nada", async () => {
    const f = fetchEspia();
    const manejar = crearManejadorTry({
      requireRoot: async () => GUARD_NO_ROOT,
      fetchImpl: f.impl,
    });
    const res = await manejar(requestTry(payloadDe({ metodo: "GET", path: "/api/db/roles" })));
    esperarIgual(res.status, 403, "status");
    esperarIgual((await res.json()).error, "NO_ROOT", "code");
    esperarIgual(f.llamadas.length, 0, "el fetch no se tocó");
  });

  await test("sin token: 401 antes de mirar el cuerpo", async () => {
    const f = fetchEspia();
    const manejar = crearManejadorTry({
      requireRoot: async () => ({ ok: false, status: 401, code: "SIN_TOKEN" }),
      fetchImpl: f.impl,
    });
    const res = await manejar(requestTry({ esto: "ni siquiera es un payload" }));
    esperarIgual(res.status, 401, "status");
    esperarIgual((await res.json()).error, "SIN_TOKEN", "code");
    esperarIgual(f.llamadas.length, 0, "el fetch no se tocó");
  });

  await test("mal configurado (503) tampoco ejecuta", async () => {
    const f = fetchEspia();
    const manejar = crearManejadorTry({
      requireRoot: async () => ({ ok: false, status: 503, code: "SECRETO_NO_CONFIGURADO" }),
      fetchImpl: f.impl,
    });
    const res = await manejar(requestTry(payloadDe({ metodo: "GET", path: "/api/db/roles" })));
    esperarIgual(res.status, 503, "status");
    esperarIgual(f.llamadas.length, 0, "el fetch no se tocó");
  });

  await test("siendo root, el GET se ejecuta y devuelve el contrato completo", async () => {
    const f = fetchEspia({ cuerpo: '{"roles":[]}' });
    const manejar = crearManejadorTry({
      requireRoot: async () => GUARD_OK,
      extraerToken: () => TOKEN,
      origen: () => ORIGEN,
      fetchImpl: f.impl,
    });
    const res = await manejar(requestTry(payloadDe({ metodo: "GET", path: "/api/db/roles" })));
    esperarIgual(res.status, 200, "status del endpoint /try");

    const cuerpo = (await res.json()) as Record<string, unknown>;
    for (const clave of ["status", "statusText", "headers", "body", "duracionMs", "truncado"]) {
      esperar(clave in cuerpo, `falta \`${clave}\` en la respuesta`);
    }
    esperar(!("ok" in cuerpo), "`ok` es interno y no se publica");
    esperarIgual(cuerpo.status, 200, "status del endpoint probado");
    esperarIgual(cuerpo.body, '{"roles":[]}', "cuerpo");
    esperarIgual(headersDe(f.llamadas[0]).authorization, `Bearer ${TOKEN}`, "sesión reenviada");
  });

  await test("siendo root, una escritura sin confirmación sigue siendo 428", async () => {
    const f = fetchEspia();
    const manejar = crearManejadorTry({
      requireRoot: async () => GUARD_OK,
      extraerToken: () => TOKEN,
      origen: () => ORIGEN,
      fetchImpl: f.impl,
    });
    const res = await manejar(requestTry(payloadDe({ metodo: "POST", path: "/api/db/roles" })));
    esperarIgual(res.status, 428, "status");
    esperarIgual((await res.json()).error, "CONFIRMACION_REQUERIDA", "code");
    esperarIgual(f.llamadas.length, 0, "el fetch no se tocó");
  });

  await test("un cuerpo que no es JSON devuelve 400, no una excepción", async () => {
    const manejar = crearManejadorTry({ requireRoot: async () => GUARD_OK });
    const req = new NextRequest(`${ORIGEN}/api/docs/try`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "esto no es json",
    });
    const res = await manejar(req);
    esperarIgual(res.status, 400, "status");
    esperarIgual((await res.json()).error, "PAYLOAD_INVALIDO", "code");
  });

  await test("la respuesta del manejador es un NextResponse", async () => {
    const manejar = crearManejadorTry({ requireRoot: async () => GUARD_NO_ROOT });
    const res = await manejar(requestTry(payloadDe({ metodo: "GET", path: "/api/db/roles" })));
    esperar(res instanceof NextResponse, "tendría que ser un NextResponse");
  });

  console.log(
    `\n${pasaron} ok, ${fallaron.length} fallidos${fallaron.length ? `: ${fallaron.join(", ")}` : ""}\n`,
  );
  if (fallaron.length > 0) process.exit(1);
}

void main();
