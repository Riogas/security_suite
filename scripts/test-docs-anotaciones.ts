/**
 * scripts/test-docs-anotaciones.ts
 *
 * Test ANTIENVEJECIMIENTO del catálogo de APIs (fase 7 de la spec del portal
 * `/docs`). Se corre con:
 *
 *   pnpm test                  (junto con el resto)
 *   pnpm test:docs-anotaciones
 *
 * Qué protege: que un endpoint NUEVO no entre al repositorio sin una entrada en
 * `docs/api/anotaciones.yaml`. Los 51 que hoy no están anotados están listados
 * abajo, uno por uno, en `SIN_ANOTAR_ACEPTADOS`: por eso el test arranca en
 * verde y solo falla con lo que se agregue a partir de ahora.
 *
 * La lista es una deuda declarada, no una alfombra. Por eso el test también
 * falla al revés:
 *
 *   - si una excepción ya no corresponde a ningún endpoint (se renombró o se
 *     borró la ruta), hay que sacarla;
 *   - si una excepción **ya está anotada**, hay que sacarla también, para que
 *     la lista solo pueda achicarse;
 *   - si una anotación no matchea ningún endpoint (huérfana), hay un typo o un
 *     renombre a arreglar.
 *
 * NO toca la base ni la red: lee los dos archivos del filesystem.
 */

import * as fs from "fs";
import * as path from "path";
import { load as parsearYaml } from "js-yaml";

const RAIZ = process.cwd();
const RUTA_OPENAPI = path.join(RAIZ, "docs", "api", "openapi.json");
const RUTA_ANOTACIONES = path.join(RAIZ, "docs", "api", "anotaciones.yaml");

/**
 * Los endpoints que hoy NO están anotados y que se aceptan así.
 *
 * Son el CRUD del RBAC: familias regulares (`GET/POST/PUT/DELETE` sobre
 * usuarios, roles, funcionalidades, acciones, aplicaciones, objetos y accesos)
 * que consume únicamente el propio panel de SecuritySuite y cuya forma el
 * generador ya describe bien a partir del código. Lo que se anotó a mano es lo
 * que ningún parser puede inferir: las integraciones con terceros y el camino
 * crítico (login, permisos, menú, solicitudes, sync con el SGM, el proxy a
 * GeneXus y los dos endpoints del propio portal).
 *
 * Para sacar uno de acá: anotalo en `docs/api/anotaciones.yaml` y borralo de
 * esta lista. El test se encarga de que no quede a medias.
 */
const SIN_ANOTAR_ACEPTADOS: readonly string[] = [
  "DELETE /api/db/accesos",
  "DELETE /api/db/acciones/{id}",
  "DELETE /api/db/aplicaciones/{id}",
  "DELETE /api/db/funcionalidades/{id}",
  "DELETE /api/db/objetos/{id}",
  "DELETE /api/db/roles/{id}",
  "DELETE /api/db/usuarios/{id}",
  "GET /api/db/accesos",
  "GET /api/db/acciones",
  "GET /api/db/acciones/{id}",
  "GET /api/db/aplicaciones",
  "GET /api/db/aplicaciones/{id}",
  "GET /api/db/aplicaciones/{id}/roles",
  "GET /api/db/funcionalidades",
  "GET /api/db/funcionalidades/{id}",
  "GET /api/db/funcionalidades/{id}/acciones",
  "GET /api/db/menu/builder",
  "GET /api/db/objetos",
  "GET /api/db/objetos/{id}",
  "GET /api/db/roles/{id}",
  "GET /api/db/usuario-preferencias/sugerencias",
  "GET /api/db/usuarios",
  "GET /api/db/usuarios/{id}",
  "GET /api/db/usuarios/{id}/accesos",
  "GET /api/db/usuarios/{id}/atributos",
  "GET /api/db/usuarios/{id}/roles",
  "POST /api/db/accesos",
  "POST /api/db/acciones",
  "POST /api/db/aplicaciones",
  "POST /api/db/funcionalidades",
  "POST /api/db/objetos",
  "POST /api/db/roles",
  "POST /api/db/roles/{id}/atributos",
  "POST /api/db/roles/{id}/clonar",
  "POST /api/db/usuarios",
  "POST /api/db/usuarios/{id}/atributos",
  "POST /api/db/usuarios/{id}/permite-login",
  "PUT /api/db/acciones/{id}",
  "PUT /api/db/aplicaciones/{id}",
  "PUT /api/db/funcionalidades/{id}",
  "PUT /api/db/funcionalidades/{id}/acciones",
  "PUT /api/db/menu/builder",
  "PUT /api/db/objetos/{id}",
  "PUT /api/db/roles/{id}",
  "PUT /api/db/usuarios/{id}",
  "PUT /api/db/usuarios/{id}/accesos",
  "PUT /api/db/usuarios/{id}/atributos",
  "PUT /api/db/usuarios/{id}/roles",
];

// ─── Mini framework de aserciones ───────────────────────────────────────────

let pasaron = 0;
const fallaron: string[] = [];

function test(nombre: string, fn: () => void): void {
  try {
    fn();
    pasaron++;
    console.log(`  ✓ ${nombre}`);
  } catch (error) {
    fallaron.push(nombre);
    console.log(`  ✗ ${nombre}`);
    for (const linea of (error as Error).message.split("\n")) console.log(`      ${linea}`);
  }
}

function esperar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(mensaje);
}

function lista(items: readonly string[]): string {
  return items.map((i) => `  · ${i}`).join("\n");
}

// ─── Carga ──────────────────────────────────────────────────────────────────

interface DocumentoOpenApi {
  paths?: Record<string, Record<string, unknown>>;
}

const documento = JSON.parse(fs.readFileSync(RUTA_OPENAPI, "utf8")) as DocumentoOpenApi;
const anotaciones = (parsearYaml(fs.readFileSync(RUTA_ANOTACIONES, "utf8")) ?? {}) as {
  endpoints?: Record<string, unknown>;
};

const endpoints: string[] = [];
for (const ruta of Object.keys(documento.paths ?? {})) {
  for (const metodo of Object.keys(documento.paths?.[ruta] ?? {})) {
    endpoints.push(`${metodo.toUpperCase()} ${ruta}`);
  }
}
endpoints.sort();

const anotados = new Set(Object.keys(anotaciones.endpoints ?? {}));
const aceptados = new Set(SIN_ANOTAR_ACEPTADOS);
const existentes = new Set(endpoints);

// ─── Los casos ──────────────────────────────────────────────────────────────

console.log("\nanotaciones — antienvejecimiento del catálogo\n");

test("openapi.json tiene endpoints (el generador corrió)", () => {
  esperar(
    endpoints.length > 0,
    "docs/api/openapi.json no tiene ningún endpoint. Corré `pnpm docs:api`.",
  );
});

test("todo endpoint nuevo está anotado (o declarado como excepción)", () => {
  const huerfanosDeAnotacion = endpoints.filter((k) => !anotados.has(k) && !aceptados.has(k));
  esperar(
    huerfanosDeAnotacion.length === 0,
    `Hay ${huerfanosDeAnotacion.length} endpoint(s) sin entrada en docs/api/anotaciones.yaml:\n` +
      `${lista(huerfanosDeAnotacion)}\n` +
      `Anotalos (ver docs/api/README.md) — o, si de verdad no lo merecen, sumalos a\n` +
      `SIN_ANOTAR_ACEPTADOS en este archivo explicando por qué.`,
  );
});

test("ninguna anotación quedó huérfana (typo o ruta renombrada)", () => {
  const huerfanas = [...anotados].filter((k) => !existentes.has(k)).sort();
  esperar(
    huerfanas.length === 0,
    `Estas anotaciones no matchean ningún endpoint de openapi.json:\n${lista(huerfanas)}\n` +
      `La clave tiene que ser exactamente "MÉTODO /ruta" (parámetros entre llaves).`,
  );
});

test("la lista de excepciones no tiene endpoints que ya no existen", () => {
  const fantasmas = SIN_ANOTAR_ACEPTADOS.filter((k) => !existentes.has(k));
  esperar(
    fantasmas.length === 0,
    `Estas excepciones no corresponden a ningún endpoint (se renombró o se borró la ruta):\n` +
      `${lista(fantasmas)}\nSacalas de SIN_ANOTAR_ACEPTADOS.`,
  );
});

test("la lista de excepciones solo puede achicarse", () => {
  const yaAnotados = SIN_ANOTAR_ACEPTADOS.filter((k) => anotados.has(k));
  esperar(
    yaAnotados.length === 0,
    `Estos endpoints ya están anotados y siguen figurando como excepción:\n` +
      `${lista(yaAnotados)}\nSacalos de SIN_ANOTAR_ACEPTADOS.`,
  );
});

test("la lista de excepciones no tiene duplicados y está ordenada", () => {
  const duplicados = SIN_ANOTAR_ACEPTADOS.filter((k, i) => SIN_ANOTAR_ACEPTADOS.indexOf(k) !== i);
  esperar(duplicados.length === 0, `Excepciones duplicadas:\n${lista(duplicados)}`);

  const ordenada = [...SIN_ANOTAR_ACEPTADOS].sort();
  esperar(
    ordenada.join("|") === SIN_ANOTAR_ACEPTADOS.join("|"),
    "SIN_ANOTAR_ACEPTADOS tiene que estar ordenada alfabéticamente (el diff se lee mejor).",
  );
});

console.log(
  `\n${endpoints.length} endpoints · ${anotados.size} anotados · ` +
    `${SIN_ANOTAR_ACEPTADOS.length} excepciones declaradas`,
);
console.log(
  `\n${pasaron} ok, ${fallaron.length} fallidos${fallaron.length ? `: ${fallaron.join(", ")}` : ""}\n`,
);
if (fallaron.length > 0) process.exit(1);
