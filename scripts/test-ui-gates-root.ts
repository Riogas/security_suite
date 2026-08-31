/**
 * scripts/test-ui-gates-root.ts
 *
 * Test de la capa VISUAL del gate de root. Se corre con:
 *
 *   pnpm test                 (junto con el resto)
 *   pnpm test:ui-gates-root
 *
 * Qué problema cuida. El guard de /api/db (src/lib/auth/apiGuard.ts) cerró el
 * panel en dos niveles: ROOT para lo que altera quién tiene qué, y ADMIN para
 * el resto (root O la funcionalidad que un root otorgue). El panel, en cambio,
 * seguía mostrándole los botones de crear, guardar y borrar a todo el mundo: la
 * persona llenaba el formulario entero y comía el 403 al final. El arreglo fue
 * gatear los controles con `BotonRoot` / `AvisoSoloRoot`
 * (src/components/ui/solo-root.tsx), que preguntan por
 * `usePuedeAdministrar(alcance)`.
 *
 * Desde que existe ADMIN, el gate puede mentir en las DOS direcciones, y las
 * dos importan:
 *
 *   - Ofrecer un botón que el servidor va a rechazar (el problema original).
 *   - ESCONDERLE un botón a alguien que sí lo tiene habilitado. Eso pasa si una
 *     pantalla de nivel ADMIN sigue preguntando por `"ROOT"`, y es lo que este
 *     test agrega: no alcanza con que la pantalla conozca el gate, tiene que
 *     preguntar por el alcance CORRECTO.
 *
 * El riesgo de ese arreglo es envejecer: mañana alguien agrega una pantalla que
 * llama a `apiCrearRolDB` y se olvida del gate, y el panel vuelve a ofrecer una
 * escritura que el servidor rechaza. Igual que con `test-api-guard.ts`, la red
 * de contención no es la disciplina: es este test.
 *
 * Cómo funciona, en dos pasos y sin listas escritas a mano:
 *
 *   1. Lee `src/services/api.ts` y saca, de cada función exportada, los
 *      `dbFetch()` que hace con su path y su método. Le pregunta a
 *      `nivelDeRuta()` — la MISMA función que usa el guard en runtime — cuáles
 *      de esos caen en ROOT. Resultado: el conjunto de funciones cliente que
 *      hoy pegan a un endpoint de root, derivado de la tabla de políticas y no
 *      de una lista paralela que se desincroniza.
 *
 *   2. Busca en `src/app` y `src/components` los archivos que importan alguna
 *      de esas funciones, y exige que el archivo importe también el gate.
 *
 * Lo que este test NO puede probar: que el gate esté puesto en el botón
 * CORRECTO dentro del archivo. Eso se mira leyendo. Lo que sí garantiza es que
 * ningún archivo escriba contra un endpoint ROOT sin haberse enterado de que el
 * gate existe, que es el olvido que se quiere cazar.
 *
 * No toca la base ni la red: es análisis estático de los fuentes.
 */

import * as fs from "fs";
import * as path from "path";
import { alcanceAdminDeRuta, nivelDeRuta, OBJETO_KEYS_ADMIN } from "../src/lib/auth/apiGuard";

// ─── Mini framework de aserciones ───────────────────────────────────────────
// Mismo formato que scripts/test-api-guard.ts: el repo no tiene runner.

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
    console.log(`      ${(error as Error).message}`);
  }
}

function esperar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(mensaje);
}

// ─── Paso 1: qué funciones de api.ts pegan a un endpoint ROOT ───────────────

const RAIZ = process.cwd();
const API_TS = path.join(RAIZ, "src/services/api.ts");

/**
 * Módulos que exportan el gate. Importar cualquiera de los dos cuenta:
 * `solo-root` para los controles, el hook para los casos que no son un botón
 * (el árbol del builder de menú).
 */
const MODULOS_DEL_GATE = [
  "@/components/ui/solo-root",
  "@/hooks/usePuedeAdministrar",
] as const;

interface LlamadaDb {
  /** Nombre de la función exportada que la contiene. */
  funcion: string;
  metodo: string;
  /** Path concreto, con los `${...}` reemplazados por un valor de prueba. */
  path: string;
}

/**
 * Saca de api.ts todos los `dbFetch(<url>, { method: ... })` y los atribuye a la
 * función exportada más cercana hacia arriba.
 *
 * Es análisis por texto y no un parser: alcanza porque api.ts declara todo con
 * el mismo molde (`export const apiXxx = async (...) => dbFetch(...)`). Si
 * alguna vez deja de alcanzar, el síntoma es que `FUNCIONES_ROOT` queda vacío o
 * corto, y la primera aserción de abajo lo caza.
 */
function extraerLlamadasDb(fuente: string): LlamadaDb[] {
  const exportaciones: { nombre: string; indice: number }[] = [];
  const reExport = /^export\s+(?:const|async\s+function|function)\s+(\w+)/gm;
  for (let m = reExport.exec(fuente); m; m = reExport.exec(fuente)) {
    exportaciones.push({ nombre: m[1], indice: m.index });
  }

  const nombreEn = (indice: number): string => {
    let actual = "(fuera de una exportación)";
    for (const e of exportaciones) {
      if (e.indice > indice) break;
      actual = e.nombre;
    }
    return actual;
  };

  const llamadas: LlamadaDb[] = [];
  // El primer argumento de dbFetch es siempre un literal: `"/api/db/roles"` o
  // una template string con interpolaciones.
  const reDbFetch = /dbFetch\(\s*(?:`([^`]*)`|"([^"]*)")/g;
  for (let m = reDbFetch.exec(fuente); m; m = reDbFetch.exec(fuente)) {
    const url = (m[1] ?? m[2] ?? "").split("?")[0];
    if (!url.startsWith("/api/db/")) continue;

    // `${id}` → un valor cualquiera: los patrones del guard son `:param` y
    // matchean contra un segmento concreto, no contra la expresión.
    const pathConcreto = url.replace(/\$\{[^}]*\}/g, "1");

    // El método está en el objeto de opciones de ESTA llamada, y hay que
    // acotar la ventana para no leer el de otra. Dos cortes:
    //
    //   - si después del literal de la URL no viene una coma, la llamada no
    //     lleva opciones y es un GET, punto;
    //   - si las lleva, la ventana termina en el próximo `dbFetch(`.
    //
    // Sin eso, `apiAccionesFuncionalidadDB` — que es `dbFetch(url)` pelado, un
    // GET — se comía el `method: "PUT"` de `apiSetAccionesFuncionalidadDB`,
    // la función que le sigue en el archivo, y aparecía como escritura de root.
    const desde = m.index + m[0].length;
    const restante = fuente.slice(desde, desde + 400);
    const hayOpciones = restante.trimStart().startsWith(",");
    const corteProximaLlamada = restante.indexOf("dbFetch(");
    const cola = !hayOpciones
      ? ""
      : corteProximaLlamada >= 0
        ? restante.slice(0, corteProximaLlamada)
        : restante;
    const mMetodo = /method:\s*"(\w+)"/.exec(cola);
    llamadas.push({
      funcion: nombreEn(m.index),
      metodo: mMetodo ? mMetodo[1] : "GET",
      path: pathConcreto,
    });
  }

  return llamadas;
}

const fuenteApi = fs.readFileSync(API_TS, "utf8");
const llamadas = extraerLlamadasDb(fuenteApi);

/** Funciones exportadas de api.ts que pegan a AL MENOS un endpoint ROOT. */
const FUNCIONES_ROOT = new Set<string>();
/** Ídem para ADMIN, con el conjunto de `objetoKey` que cada una toca. */
const FUNCIONES_ADMIN = new Map<string, Set<string>>();
for (const l of llamadas) {
  // Solo las ESCRITURAS. Una lectura cerrada tampoco la puede hacer todo el
  // mundo, pero su síntoma es otro: la pantalla no carga y se ve el error. El
  // daño que este test cuida es el del formulario llenado a cambio de un 403,
  // y ese lo hacen los POST/PUT/PATCH/DELETE. (Los endpoints ROOT son TODOS
  // escrituras, así que para ese nivel esto no cambia nada.)
  if (l.metodo.toUpperCase() === "GET") continue;
  const nivel = nivelDeRuta(l.path, l.metodo);
  if (nivel === "ROOT") FUNCIONES_ROOT.add(l.funcion);
  if (nivel === "ADMIN") {
    const alcance = alcanceAdminDeRuta(l.path, l.metodo);
    if (alcance) {
      let objetos = FUNCIONES_ADMIN.get(l.funcion);
      if (!objetos) {
        objetos = new Set<string>();
        FUNCIONES_ADMIN.set(l.funcion, objetos);
      }
      objetos.add(alcance.objetoKey);
    }
  }
}

/** Todas las funciones cerradas, de cualquiera de los dos niveles. */
const FUNCIONES_CERRADAS = new Set<string>([...FUNCIONES_ROOT, ...FUNCIONES_ADMIN.keys()]);

/**
 * `alcance="..."` declarados en un archivo. Es lo que el gate le pasa al hook, y
 * lo que hay que comparar contra el nivel real del endpoint.
 */
function alcancesDeclarados(fuente: string): Set<string> {
  const encontrados = new Set<string>();
  const re = /(?:alcance=|usePuedeAdministrar\()\s*"([^"]+)"/g;
  for (let m = re.exec(fuente); m; m = re.exec(fuente)) encontrados.add(m[1]);
  return encontrados;
}

// ─── Paso 2: quién las usa, y si conoce el gate ─────────────────────────────

function recorrer(dir: string, acumulado: string[] = []): string[] {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(completo, acumulado);
    else if (/\.tsx?$/.test(entrada.name)) acumulado.push(completo);
  }
  return acumulado;
}

const ARCHIVOS_UI = [
  ...recorrer(path.join(RAIZ, "src/app")),
  ...recorrer(path.join(RAIZ, "src/components")),
].filter((f) => !f.includes(`${path.sep}api${path.sep}`)); // las rutas del server no son UI

function rel(p: string): string {
  return path.relative(RAIZ, p).split(path.sep).join("/");
}

// ─── Tests ──────────────────────────────────────────────────────────────────

console.log("\nGate visual de root (src/components/ui/solo-root.tsx)\n");

test("api.ts declara funciones contra endpoints cerrados (el extractor sigue sirviendo)", () => {
  // Si esto se rompe, lo más probable no es que se hayan borrado los endpoints
  // sino que api.ts cambió de molde y el extractor dejó de ver los dbFetch.
  esperar(
    llamadas.length > 40,
    `esperaba muchas llamadas a dbFetch en api.ts, encontré ${llamadas.length}: el extractor dejó de funcionar`,
  );
  esperar(
    FUNCIONES_ROOT.size >= 15,
    `esperaba al menos 15 funciones contra endpoints ROOT, encontré ${FUNCIONES_ROOT.size}: ` +
      `[${[...FUNCIONES_ROOT].sort().join(", ")}]`,
  );
  esperar(
    FUNCIONES_ADMIN.size >= 4,
    `esperaba al menos 4 funciones de ESCRITURA contra endpoints ADMIN, encontré ${FUNCIONES_ADMIN.size}: ` +
      `[${[...FUNCIONES_ADMIN.keys()].sort().join(", ")}]`,
  );
});

test("toda pantalla que ESCRIBE contra un endpoint ROOT o ADMIN conoce el gate", () => {
  // Antes esto solo miraba ROOT, y con el nivel ADMIN se habría quedado
  // mirando la mitad del problema: verde prestado sobre las ~15 pantallas que
  // el guard acababa de cerrar.
  const sinGate: string[] = [];

  for (const archivo of ARCHIVOS_UI) {
    const fuente = fs.readFileSync(archivo, "utf8");
    if (!fuente.includes('from "@/services/api"')) continue;

    const usadas = [...FUNCIONES_CERRADAS].filter((fn) =>
      new RegExp(`\\b${fn}\\b`).test(fuente),
    );
    if (usadas.length === 0) continue;

    const tieneGate = MODULOS_DEL_GATE.some((m) => fuente.includes(`from "${m}"`));
    if (!tieneGate) sinGate.push(`${rel(archivo)} (usa ${usadas.sort().join(", ")})`);
  }

  esperar(
    sinGate.length === 0,
    "estos archivos escriben contra endpoints de nivel ROOT o ADMIN sin importar el gate " +
      "(BotonRoot / AvisoSoloRoot / usePuedeAdministrar):\n      " +
      sinGate.join("\n      "),
  );
});

test("el `alcance` declarado existe: o es ROOT, o es una objetoKey de la tabla", () => {
  // Un typo (`alcance="usuario"` en vez de `"usuarios"`) no rompe nada visible:
  // el hook contesta `false` y el botón queda gris para siempre, incluso para
  // quien lo tiene otorgado. Es el bug silencioso de este diseño.
  const validos = new Set<string>(["ROOT", ...OBJETO_KEYS_ADMIN]);
  const invalidos: string[] = [];

  for (const archivo of ARCHIVOS_UI) {
    const fuente = fs.readFileSync(archivo, "utf8");
    for (const alcance of alcancesDeclarados(fuente)) {
      if (!validos.has(alcance)) invalidos.push(`${rel(archivo)}: "${alcance}"`);
    }
  }

  esperar(
    invalidos.length === 0,
    `alcances que no corresponden a ninguna política (válidos: ${[...validos].sort().join(", ")}):\n      ` +
      invalidos.join("\n      "),
  );
});

test("una pantalla que SOLO escribe contra endpoints ADMIN no pide root de más", () => {
  /*
   * El gate visual miente en dos direcciones. La que este caso cuida es la
   * nueva: si una pantalla que el servidor cerró a nivel ADMIN sigue
   * preguntando `alcance="ROOT"`, entonces a la persona que un root habilitó
   * le queda el botón gris con un cartel que además le miente ("Requiere
   * permisos de root"), y el permiso que le otorgaron no sirve para nada.
   *
   * Solo se exige sobre los archivos que NO tocan ningún endpoint ROOT: los que
   * tocan los dos niveles necesitan "ROOT" para sus escrituras, y ahí el gate
   * más restrictivo es el correcto.
   */
  const desalineadas: string[] = [];

  for (const archivo of ARCHIVOS_UI) {
    const fuente = fs.readFileSync(archivo, "utf8");
    if (!fuente.includes('from "@/services/api"')) continue;

    const usaRoot = [...FUNCIONES_ROOT].some((fn) => new RegExp(`\\b${fn}\\b`).test(fuente));
    if (usaRoot) continue;

    const objetosQueToca = new Set<string>();
    for (const [fn, objetos] of FUNCIONES_ADMIN) {
      if (new RegExp(`\\b${fn}\\b`).test(fuente)) for (const o of objetos) objetosQueToca.add(o);
    }
    if (objetosQueToca.size === 0) continue;

    const declarados = alcancesDeclarados(fuente);
    if (declarados.size === 0) continue; // el caso anterior ya lo cubre

    if (declarados.has("ROOT")) {
      desalineadas.push(
        `${rel(archivo)} declara alcance="ROOT" pero solo toca endpoints ADMIN de ` +
          `[${[...objetosQueToca].sort().join(", ")}]`,
      );
    }
  }

  esperar(
    desalineadas.length === 0,
    "estas pantallas le esconden el botón a quien SÍ tiene el permiso otorgado:\n      " +
      desalineadas.join("\n      "),
  );
});

test("el gate tiene un solo criterio, y las pantallas no lo esquivan", () => {
  // `useEsRoot` es el HECHO ("tengo el rol Root"); `usePuedeAdministrar` es la
  // POLÍTICA. Si una pantalla vuelve a preguntar el hecho directo, el día que
  // la política cambie ("root O la funcionalidad que un root me otorgó") esa
  // pantalla se queda vieja y nadie se entera.
  const culpables = ARCHIVOS_UI.filter(
    (a) =>
      fs.readFileSync(a, "utf8").includes('from "@/hooks/useEsRoot"') &&
      rel(a) !== "src/hooks/useEsRoot.ts",
  ).map(rel);

  esperar(
    culpables.length === 0,
    "estas pantallas importan `useEsRoot` en vez de `usePuedeAdministrar`, " +
      "y se van a quedar viejas cuando cambie la política:\n      " +
      culpables.join("\n      "),
  );
});

test("`usePuedeAdministrar` es el único que consulta `useEsRoot`", () => {
  const consumidores = recorrer(path.join(RAIZ, "src"))
    .filter((a) => {
      const r = rel(a);
      if (r === "src/hooks/useEsRoot.ts") return false;
      return fs.readFileSync(a, "utf8").includes('from "@/hooks/useEsRoot"');
    })
    .map(rel);

  esperar(
    consumidores.length === 1 && consumidores[0] === "src/hooks/usePuedeAdministrar.ts",
    "el criterio tiene que estar en UN solo lugar; hoy consultan `useEsRoot`: " +
      `[${consumidores.join(", ")}]`,
  );
});

// ─── Resultado ──────────────────────────────────────────────────────────────

console.log(
  `\n${pasaron} ok, ${fallaron.length} fallidos${fallaron.length ? ": " + fallaron.join(", ") : ""}\n`,
);
if (fallaron.length > 0) process.exit(1);
