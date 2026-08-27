/**
 * scripts/test-docs-catalogo.ts
 *
 * Test del catálogo que consume el visor y de los ejemplos copiables:
 *   - src/lib/docs/catalogo.ts          (OpenAPI mergeado → estructura del visor)
 *   - src/lib/docs/ambiente.ts          (host → DEV / PROD)
 *   - src/components/docs/ejemplos.ts   (curl / fetch / VB6)
 *
 * Se corre con:
 *   pnpm test               (junto con el resto)
 *   pnpm test:docs-catalogo
 *
 * Lee los archivos reales de docs/api/, así que además verifica que el catálogo
 * que se publica hoy se pueda armar entero sin romperse. No toca la base ni la
 * red.
 */

import {
  cargarCatalogo,
  construirCatalogo,
  describirAuth,
} from "../src/lib/docs/catalogo";
import type { DocumentoOpenApi } from "../src/lib/docs/spec";
import { ambienteDeHost } from "../src/lib/docs/ambiente";
import type { EndpointDoc } from "../src/lib/docs/catalogo";
import {
  conOrigen,
  datosDeEndpoint,
  ejemploCurl,
  ejemploFetch,
  ejemploVb6,
  sustituirParametros,
  armarQueryString,
  tieneConsumidorVb6,
} from "../src/components/docs/ejemplos";

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

// ─── Documento de juguete ───────────────────────────────────────────────────

const DOCUMENTO: DocumentoOpenApi = {
  info: { title: "De prueba", version: "1.0.0" },
  "x-colapsados": [{ entrada: "/api/{proxy}", motivo: "Catch-all a GeneXus." }],
  "x-anotaciones": { total: 4, anotados: 1, sinAnotar: [], huerfanas: [] },
  paths: {
    "/api/db/usuarios": {
      get: {
        tags: ["usuarios"],
        summary: "Lista de usuarios",
        "x-auth": { modo: "ninguna", verificaFirma: false },
        parameters: [
          { name: "estado", in: "query", schema: { type: "string" } },
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: { "200": { description: "ok" }, "404": { description: "no está" } },
      },
      post: {
        tags: ["usuarios"],
        summary: "Alta de usuario",
        "x-auth": { modo: "ninguna", verificaFirma: false },
        "x-consumidores": ["El formulario VB6 de caja."],
        "x-notas": ["No valida nada."],
        "x-anotado": true,
        requestBody: {
          requerido: true,
          descripcion: "El usuario a crear.",
          campos: [{ nombre: "username", tipo: "string", requerido: true }],
          ejemplo: '{\n  "username": "jperez"\n}',
        },
        responses: { "201": { description: "creado" } },
      },
    },
    "/api/db/menu": {
      get: {
        tags: ["menu"],
        summary: "Menú",
        "x-auth": { modo: "jwt", verificaFirma: true },
        responses: {},
      },
    },
    "/api/{proxy}": {
      get: {
        tags: ["proxy"],
        summary: "Proxy a GeneXus",
        "x-auth": { modo: "passthrough", verificaFirma: false },
        responses: {},
      },
    },
  },
};

function porId(endpoints: EndpointDoc[], id: string): EndpointDoc {
  const e = endpoints.find((x) => x.id === id);
  if (!e) throw new Error(`no está el endpoint ${id}`);
  return e;
}

async function main(): Promise<void> {
  console.log("\ncatalogo — badges de autenticación\n");

  await test("`ninguna` es SIN AUTH, en rojo y marcado como sinAuth", () => {
    const a = describirAuth({ modo: "ninguna" });
    esperarIgual(a.etiqueta, "SIN AUTH", "etiqueta");
    esperarIgual(a.tono, "peligro", "tono");
    esperarIgual(a.sinAuth, true, "sinAuth");
  });

  await test("`jwt` se parte según verifique la firma o no", () => {
    const verificado = describirAuth({ modo: "jwt", verificaFirma: true });
    esperarIgual(verificado.etiqueta, "JWT verificado", "etiqueta");
    esperarIgual(verificado.tono, "ok", "tono");

    const sinVerificar = describirAuth({ modo: "jwt", verificaFirma: false });
    esperarIgual(sinVerificar.etiqueta, "JWT sin verificar firma", "etiqueta");
    esperarIgual(sinVerificar.tono, "advertencia", "tono");
    esperarIgual(sinVerificar.sinAuth, false, "un JWT flojo no es lo mismo que nada");
  });

  await test("api-key, token en el body y passthrough tienen su etiqueta", () => {
    esperarIgual(describirAuth({ modo: "api-key" }).etiqueta, "x-api-key", "api-key");
    esperarIgual(
      describirAuth({ modo: "token-en-body" }).etiqueta,
      "token en el body",
      "token-en-body",
    );
    esperarIgual(
      describirAuth({ modo: "passthrough" }).etiqueta,
      "delegada al backend",
      "passthrough",
    );
  });

  await test("un x-auth ausente no rompe: queda como desconocida", () => {
    const a = describirAuth(undefined);
    esperarIgual(a.modo, "desconocida", "modo");
    esperarIgual(a.sinAuth, false, "sinAuth");
  });

  console.log("\ncatalogo — armado\n");

  const catalogo = construirCatalogo(DOCUMENTO);

  await test("cuenta los endpoints, los módulos y los que no validan nada", () => {
    esperarIgual(catalogo.endpoints.length, 4, "endpoints");
    esperarIgual(catalogo.auth.total, 4, "total");
    esperarIgual(catalogo.auth.sinAuth, 2, "sin auth");
    esperarIgual(catalogo.auth.jwtVerificado, 1, "jwt verificado");
    esperarIgual(catalogo.auth.passthrough, 1, "passthrough");
    esperarIgual(catalogo.modulos.length, 3, "módulos");
  });

  await test("cuenta aparte las escrituras sin auth (las que más queman)", () => {
    esperarIgual(catalogo.auth.escriturasSinAuth, 1, "escrituras sin auth");
  });

  await test("lista los endpoints sin auth con nombre y módulo", () => {
    const rutas = catalogo.auth.endpointsSinAuth.map((e) => `${e.metodo} ${e.ruta}`).sort();
    esperarIgual(rutas.join(" | "), "GET /api/db/usuarios | POST /api/db/usuarios", "lista");
  });

  await test("el desglose por módulo solo trae los que tienen algo sin auth", () => {
    esperarIgual(catalogo.auth.porModulo.length, 1, "módulos con sin-auth");
    esperarIgual(catalogo.auth.porModulo[0].modulo, "usuarios", "módulo");
    esperarIgual(catalogo.auth.porModulo[0].sinAuth, 2, "cantidad");
  });

  await test("los parámetros salen ordenados: path primero, después query", () => {
    const e = porId(catalogo.endpoints, "get /api/db/usuarios");
    esperarIgual(e.parametros[0].nombre, "id", "primero");
    esperarIgual(e.parametros[0].lugar, "path", "lugar del primero");
    esperarIgual(e.parametros[0].requerido, true, "requerido");
    esperarIgual(e.parametros[1].nombre, "estado", "segundo");
  });

  await test("el cuerpo en forma corta se entiende: campos y ejemplo", () => {
    const e = porId(catalogo.endpoints, "post /api/db/usuarios");
    esperar(e.cuerpo !== undefined, "tendría que tener cuerpo");
    esperarIgual(e.cuerpo?.requerido, true, "requerido");
    esperarIgual(e.cuerpo?.campos[0].nombre, "username", "campo");
    esperar((e.cuerpo?.ejemplo ?? "").includes("jperez"), "el ejemplo tiene que estar");
  });

  await test("sin lista de errores, se derivan de las respuestas >= 400", () => {
    const e = porId(catalogo.endpoints, "get /api/db/usuarios");
    esperarIgual(e.errores.length, 1, "errores");
    esperarIgual(e.errores[0].status, 404, "status");
  });

  await test("el catch-all colapsado no es ejecutable desde el Try it", () => {
    esperarIgual(porId(catalogo.endpoints, "get /api/{proxy}").ejecutable, false, "proxy");
    esperarIgual(porId(catalogo.endpoints, "get /api/db/menu").ejecutable, true, "menú");
  });

  await test("el índice del buscador cubre path, módulo, summary y consumidores", () => {
    const e = porId(catalogo.endpoints, "post /api/db/usuarios");
    for (const termino of ["/api/db/usuarios", "usuarios", "alta de usuario", "vb6", "sin auth"]) {
      esperar(e.indice.includes(termino.toLowerCase()), `el índice tendría que tener "${termino}"`);
    }
  });

  console.log("\ncatalogo — los archivos reales de docs/api\n");

  await test("el catálogo que se publica hoy se arma entero", async () => {
    const real = await cargarCatalogo();
    esperar(real.endpoints.length > 0, "tendría que haber endpoints");
    esperarIgual(real.auth.total, real.endpoints.length, "total coherente");
    esperarIgual(
      real.auth.sinAuth,
      real.endpoints.filter((e) => e.auth.sinAuth).length,
      "conteo de sin-auth coherente",
    );
    esperarIgual(real.anotaciones.huerfanas.length, 0, "anotaciones huérfanas");
    esperar(
      real.endpoints.every((e) => e.summary !== ""),
      "todo endpoint tiene que tener summary",
    );
  });

  await test("ningún ejemplo anotado hardcodea un host", async () => {
    const real = await cargarCatalogo();
    const culpables: string[] = [];
    for (const e of real.endpoints) {
      for (const ej of e.ejemplos) {
        if (/https?:\/\/(?!\{\{ORIGEN\}\})/.test(ej.codigo)) culpables.push(`${e.id} — ${ej.titulo}`);
      }
    }
    esperarIgual(
      culpables.join(", "),
      "",
      "los ejemplos tienen que usar {{ORIGEN}}, no un host escrito a mano",
    );
  });

  console.log("\nambiente\n");

  await test("un host con `dev` es DEV; el resto, PROD", () => {
    esperarIgual(ambienteDeHost("secapi-dev.riogas.com.uy"), "DEV", "dev");
    esperarIgual(ambienteDeHost("192.168.2.22:4005"), "PROD", "ip");
    esperarIgual(ambienteDeHost("secapi.riogas.com.uy"), "PROD", "prod");
    // A propósito: el error caro es mostrar DEV cuando en realidad es producción.
    esperarIgual(ambienteDeHost("localhost:4005"), "PROD", "localhost");
  });

  console.log("\nejemplos copiables\n");

  const endpointGet = porId(catalogo.endpoints, "get /api/db/menu");
  const endpointPost = porId(catalogo.endpoints, "post /api/db/usuarios");
  const ORIGEN = "https://secapi-dev.riogas.com.uy";

  await test("los ejemplos usan el origen que se les pasa, no una constante", () => {
    const datos = datosDeEndpoint(endpointGet, ORIGEN, "/api/db/menu?aplicacionId=3");
    for (const codigo of [ejemploCurl(datos), ejemploFetch(datos), ejemploVb6(datos)]) {
      esperar(codigo.includes(ORIGEN), "el ejemplo tiene que traer el origen");
      esperar(!codigo.includes("localhost"), "no puede quedar ningún localhost");
    }
  });

  await test("curl: el GET no lleva -X, la escritura sí, y el cuerpo va en -d", () => {
    const get = ejemploCurl(datosDeEndpoint(endpointGet, ORIGEN, "/api/db/menu"));
    esperar(get.startsWith("curl \""), `esperaba un curl simple, vino: ${get.split("\n")[0]}`);

    const post = ejemploCurl(
      datosDeEndpoint(endpointPost, ORIGEN, "/api/db/usuarios", '{"username":"jperez"}'),
    );
    esperar(post.includes("curl -X POST"), "la escritura lleva -X POST");
    esperar(post.includes(`-d '{"username":"jperez"}'`), "el cuerpo va en -d");
    esperar(post.includes("Content-Type: application/json"), "y con su content-type");
  });

  await test("curl: un JWT se muestra como Bearer; sin auth no se inventa header", () => {
    const conJwt = ejemploCurl(datosDeEndpoint(endpointGet, ORIGEN, "/api/db/menu"));
    esperar(conJwt.includes("Authorization: Bearer $TOKEN"), "JWT");

    const sinAuth = ejemploCurl(datosDeEndpoint(endpointPost, ORIGEN, "/api/db/usuarios"));
    esperar(!sinAuth.includes("Authorization"), "un endpoint sin auth no lleva Authorization");
  });

  await test("fetch: sale un snippet que compila mentalmente", () => {
    const codigo = ejemploFetch(
      datosDeEndpoint(endpointPost, ORIGEN, "/api/db/usuarios", '{"username":"jperez"}'),
    );
    esperar(codigo.includes('method: "POST",'), "método");
    esperar(codigo.includes("JSON.stringify("), "cuerpo serializado");
    esperar(codigo.includes("await respuesta.json()"), "lectura de la respuesta");
  });

  await test("VB6: comillas duplicadas y ServerXMLHTTP sincrónico", () => {
    const codigo = ejemploVb6(
      datosDeEndpoint(endpointPost, ORIGEN, "/api/db/usuarios", '{"username":"jperez"}'),
    );
    esperar(codigo.includes('CreateObject("MSXML2.ServerXMLHTTP.6.0")'), "objeto");
    esperar(codigo.includes('http.Open "POST", sUrl, False'), "apertura sincrónica");
    esperar(codigo.includes('""username"":""jperez""'), `comillas duplicadas; vino: ${codigo}`);
    esperar(codigo.includes("http.send sBody"), "envío del cuerpo");
  });

  await test("el ejemplo VB6 aparece solo si hay un consumidor VB6", () => {
    esperarIgual(tieneConsumidorVb6(endpointPost), true, "post (consumidor VB6)");
    esperarIgual(tieneConsumidorVb6(endpointGet), false, "get (sin consumidor VB6)");
  });

  await test("conOrigen reemplaza el marcador y los hosts que quedaron escritos", () => {
    esperarIgual(
      conOrigen("curl {{ORIGEN}}/api/db/menu", ORIGEN),
      `curl ${ORIGEN}/api/db/menu`,
      "marcador",
    );
    esperarIgual(
      conOrigen("curl http://localhost:4005/api/x", ORIGEN),
      `curl ${ORIGEN}/api/x`,
      "localhost viejo",
    );
  });

  await test("los parámetros de path se sustituyen y se escapan", () => {
    esperarIgual(
      sustituirParametros("/api/db/usuarios/{id}/roles", { id: "7" }),
      "/api/db/usuarios/7/roles",
      "sustitución",
    );
    esperarIgual(
      sustituirParametros("/api/db/usuarios/{id}", { id: "a/b" }),
      "/api/db/usuarios/a%2Fb",
      "escapado",
    );
    esperarIgual(
      sustituirParametros("/api/db/usuarios/{id}", {}),
      "/api/db/usuarios/{id}",
      "sin valor queda a la vista lo que falta",
    );
  });

  await test("la query se arma salteando los vacíos", () => {
    esperarIgual(armarQueryString({ a: "1", b: "", c: "x" }), "?a=1&c=x", "query");
    esperarIgual(armarQueryString({}), "", "query vacía");
  });

  console.log(
    `\n${pasaron} ok, ${fallaron.length} fallidos${fallaron.length ? `: ${fallaron.join(", ")}` : ""}\n`,
  );
  if (fallaron.length > 0) process.exit(1);
}

void main();
