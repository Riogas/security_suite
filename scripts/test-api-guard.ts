/**
 * scripts/test-api-guard.ts
 *
 * Test del guard de /api/db (src/lib/auth/apiGuard.ts) y de la verificación de
 * JWT compartida (src/lib/auth/verificarJwt.ts). Se corre con:
 *
 *   pnpm test              (junto con el resto)
 *   pnpm test:api-guard
 *
 * El repo no tiene runner de tests: esto es un script `tsx` con sus propias
 * aserciones, mismo formato que `scripts/test-docs-root-guard.ts`.
 *
 * NO toca la base ni la red: el guard se construye con `crearGuardApi()` y un
 * `resolveUsuario` falso. Los JWT son reales (firmados con `jsonwebtoken`),
 * porque lo que se está probando es justamente que la firma se mire.
 *
 * Además de las decisiones del guard hay una sección ANTIENVEJECIMIENTO que
 * recorre `src/app/api/db/**\/route.ts`: si mañana alguien agrega una ruta y se
 * olvida de llamar al guard, o la agrega sin política, el test falla. Esa es la
 * red de contención de haber elegido un helper por ruta en vez de un middleware.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import {
  crearGuardApi,
  nivelDeRuta,
  POLITICAS,
  type ResultadoApiAuth,
} from "../src/lib/auth/apiGuard";
import { leerSecretoJwt, verificarJwt } from "../src/lib/auth/verificarJwt";
import type { UsuarioAuth } from "../src/lib/permisos";

// El guard lee JWT_SECRET en cada request y exige que sea un secreto real: sin
// esto, TODOS los casos darían 503 SECRETO_NO_CONFIGURADO.
const SECRETO_TEST = "secreto-de-prueba-solo-para-este-script";
process.env.JWT_SECRET = SECRETO_TEST;

/** Api-key de servicio de los tests. 32+ caracteres, como exige el guard. */
const CLAVE_SERVICIO = "clave-de-servicio-de-prueba-0123456789";

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

function esperarDenegado(r: ResultadoApiAuth, status: number, code: string): void {
  esperar(!r.ok, "esperaba denegación, vino ok=true");
  if (r.ok) return;
  esperarIgual(r.status, status, "status");
  esperarIgual(r.code, code, "code");
  esperarIgual(r.respuesta.status, status, "status de la respuesta");
  esperarIgual(r.respuesta.headers.get("x-auth-guard"), code, "header x-auth-guard");
}

/** Corre `fn` con otro JWT_SECRET (o sin ninguno) y lo deja como estaba. */
async function conSecreto(valor: string | undefined, fn: () => Promise<void>): Promise<void> {
  const previo = process.env.JWT_SECRET;
  if (valor === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = valor;
  try {
    await fn();
  } finally {
    if (previo === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previo;
  }
}

/** Ídem para SECAPI_SERVICE_KEY. */
async function conClaveServicio(valor: string | undefined, fn: () => Promise<void>): Promise<void> {
  const previo = process.env.SECAPI_SERVICE_KEY;
  if (valor === undefined) delete process.env.SECAPI_SERVICE_KEY;
  else process.env.SECAPI_SERVICE_KEY = valor;
  try {
    await fn();
  } finally {
    if (previo === undefined) delete process.env.SECAPI_SERVICE_KEY;
    else process.env.SECAPI_SERVICE_KEY = previo;
  }
}

/** El guard loguea a propósito la mala configuración y los intentos raros. */
async function sinRuido(fn: () => Promise<void>): Promise<void> {
  const err = console.error;
  const warn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  try {
    await fn();
  } finally {
    console.error = err;
    console.warn = warn;
  }
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

// Root = rol "Root" de la aplicación 1 (SecuritySuite), ya resuelto por
// `resolveUsuario`. La columna `usuarios.es_root` ya no entra en `UsuarioAuth`.
const ROOT: UsuarioAuth = {
  id: 1,
  username: "dmedaglia",
  esRootDeSecapi: true,
  aplicacionesRoot: [1, 3, 5, 6],
};
const COMUN: UsuarioAuth = {
  id: 3,
  username: "jperez",
  esRootDeSecapi: false,
  aplicacionesRoot: [],
};
/**
 * Root de OTRA aplicación (GOYA, 3) pero no de SecuritySuite. El nivel ROOT del
 * guard tiene que rechazarlo: administrar GOYA no habilita a importar usuarios
 * en masa ni a reescribir preferencias de toda la base. Con el flag global
 * `es_root='S'` esta distinción no existía.
 */
const ROOT_DE_OTRA_APP: UsuarioAuth = {
  id: 4,
  username: "root-de-goya",
  esRootDeSecapi: false,
  aplicacionesRoot: [3],
};

const SEGUNDOS_7_DIAS = 7 * 24 * 60 * 60;

/** JWT real, firmado. Por defecto con el secreto del test y vigente 7 días. */
function jwtDe(
  username: string,
  opciones: { secreto?: string; expiraEnSegundos?: number } = {},
): string {
  const { secreto = SECRETO_TEST, expiraEnSegundos = SEGUNDOS_7_DIAS } = opciones;
  return jwt.sign({ iss: "security-suite", username, userId: 99, sistema: "" }, secreto, {
    expiresIn: expiraEnSegundos,
  });
}

/** El token que cualquiera se arma a mano: header y payload en base64, firma basura. */
function jwtSinFirmar(username: string): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ username })}.firma-inventada`;
}

interface Espia {
  llamadas: number;
  guard: ReturnType<typeof crearGuardApi>;
}

/** Guard con un `resolveUsuario` falso: nada de Prisma. */
function espiar(opciones: { usuario?: UsuarioAuth | null; explota?: boolean } = {}): Espia {
  const espia: Espia = { llamadas: 0, guard: null as never };
  espia.guard = crearGuardApi({
    async resolveUsuario() {
      espia.llamadas++;
      if (opciones.explota) throw new Error("la base no contesta");
      return opciones.usuario ?? null;
    },
  });
  return espia;
}

function pedido(
  metodo: string,
  ruta: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`http://localhost:4005${ruta}`, { method: metodo, headers });
}

const conToken = (t: string) => ({ authorization: `Bearer ${t}` });

// ─── Inventario real de rutas (para la sección antienvejecimiento) ──────────

const DIR_API_DB = path.join(process.cwd(), "src", "app", "api", "db");
const METODOS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

interface RutaReal {
  /** Patrón relativo a /api/db, con `:param` — la misma forma que usa POLITICAS. */
  patron: string;
  /** Path concreto para pasarle al matcher: `:id` reemplazado por un número. */
  ejemplo: string;
  metodos: string[];
  archivo: string;
  fuente: string;
}

function listarRutasReales(dir: string = DIR_API_DB): RutaReal[] {
  const salida: RutaReal[] = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      salida.push(...listarRutasReales(completo));
      continue;
    }
    if (entrada.name !== "route.ts") continue;

    const patron =
      "/" +
      path
        .relative(DIR_API_DB, path.dirname(completo))
        .split(path.sep)
        .filter(Boolean)
        .map((s) => {
          const m = /^\[(\.\.\.)?(.+)\]$/.exec(s);
          return m ? `:${m[2]}` : s;
        })
        .join("/");

    const fuente = fs.readFileSync(completo, "utf8");
    const metodos = METODOS.filter((m) =>
      new RegExp(`^\\s*export\\s+(?:async\\s+)?function\\s+${m}\\b`, "m").test(fuente),
    );

    salida.push({
      patron,
      ejemplo: "/api/db" + patron.replace(/:[^/]+/g, "123"),
      metodos,
      archivo: path.relative(process.cwd(), completo).replace(/\\/g, "/"),
      fuente,
    });
  }
  return salida.sort((a, b) => a.patron.localeCompare(b.patron));
}

/** Cuerpo aproximado de cada handler: del `export` de uno al `export` del que sigue. */
function cuerposDeHandlers(fuente: string): Array<{ metodo: string; cuerpo: string }> {
  const re = new RegExp(`^\\s*export\\s+(?:async\\s+)?function\\s+(${METODOS.join("|")})\\b`, "gm");
  const marcas: Array<{ metodo: string; desde: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(fuente)) !== null) marcas.push({ metodo: m[1], desde: m.index });
  return marcas.map((marca, i) => ({
    metodo: marca.metodo,
    cuerpo: fuente.slice(marca.desde, i + 1 < marcas.length ? marcas[i + 1].desde : fuente.length),
  }));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\nGuard de /api/db (src/lib/auth/apiGuard.ts)\n");

  // ── Verificación del token ────────────────────────────────────────────────

  await test("token válido: pasa y devuelve el usuario resuelto", async () => {
    const e = espiar({ usuario: COMUN });
    const r = await e.guard.requireApiAuth(
      pedido("GET", "/api/db/usuarios", conToken(jwtDe("jperez"))),
    );
    esperar(r.ok, "el token firmado y vigente tendría que pasar");
    if (r.ok) {
      esperarIgual(r.usuario?.username, "jperez", "usuario devuelto");
      esperarIgual(r.viaServicio, false, "viaServicio");
    }
  });

  await test("token armado a mano, sin firmar: 401 TOKEN_INVALIDO", async () => {
    // Este es EL caso: con `decodeJwt` (base64 puro) este token entraba a todo.
    const e = espiar({ usuario: ROOT });
    esperarDenegado(
      await e.guard.requireApiAuth(
        pedido("GET", "/api/db/usuarios", conToken(jwtSinFirmar("dmedaglia"))),
      ),
      401,
      "TOKEN_INVALIDO",
    );
    esperarIgual(e.llamadas, 0, "no se consulta la base con firma inválida");
  });

  await test("token firmado con OTRO secreto: 401 TOKEN_INVALIDO", async () => {
    const e = espiar({ usuario: ROOT });
    esperarDenegado(
      await e.guard.requireApiAuth(
        pedido(
          "GET",
          "/api/db/usuarios",
          conToken(jwtDe("dmedaglia", { secreto: "otro-secreto-cualquiera-largo" })),
        ),
      ),
      401,
      "TOKEN_INVALIDO",
    );
    esperarIgual(e.llamadas, 0, "no se consulta la base con firma inválida");
  });

  await test("token vencido: 401 TOKEN_VENCIDO", async () => {
    const e = espiar({ usuario: COMUN });
    esperarDenegado(
      await e.guard.requireApiAuth(
        pedido("GET", "/api/db/usuarios", conToken(jwtDe("jperez", { expiraEnSegundos: -60 }))),
      ),
      401,
      "TOKEN_VENCIDO",
    );
    esperarIgual(e.llamadas, 0, "no se consulta la base con token vencido");
  });

  await test("el token también se toma de la cookie 'token'", async () => {
    // Es como llega la sesión del panel de secapi: `dbFetch` manda la cookie del
    // mismo origen. Un guard que mirara solo el header rompía el panel entero.
    const e = espiar({ usuario: COMUN });
    const r = await e.guard.requireApiAuth(
      pedido("GET", "/api/db/usuarios", { cookie: `token=${jwtDe("jperez")}` }),
    );
    esperar(r.ok, "la cookie tendría que alcanzar");
  });

  await test("sin token: 401 SIN_TOKEN", async () => {
    const e = espiar({ usuario: COMUN });
    esperarDenegado(
      await e.guard.requireApiAuth(pedido("GET", "/api/db/usuarios")),
      401,
      "SIN_TOKEN",
    );
  });

  // ── El secreto ────────────────────────────────────────────────────────────

  await test("sin JWT_SECRET: 503 SECRETO_NO_CONFIGURADO (fail-closed)", async () => {
    const e = espiar({ usuario: ROOT });
    const token = jwtDe("dmedaglia");
    await conSecreto(undefined, () =>
      sinRuido(async () => {
        esperarDenegado(
          await e.guard.requireApiAuth(pedido("GET", "/api/db/usuarios", conToken(token))),
          503,
          "SECRETO_NO_CONFIGURADO",
        );
      }),
    );
    esperarIgual(e.llamadas, 0, "no se consulta la base sin secreto configurado");
  });

  await test("JWT_SECRET más corta que el mínimo: 503", async () => {
    const e = espiar({ usuario: ROOT });
    await conSecreto("corta", () =>
      sinRuido(async () => {
        esperarDenegado(
          await e.guard.requireApiAuth(
            pedido("GET", "/api/db/usuarios", conToken(jwtDe("dmedaglia", { secreto: "corta" }))),
          ),
          503,
          "SECRETO_NO_CONFIGURADO",
        );
      }),
    );
  });

  await test("JWT_SECRET igual al default del código: 503 (aunque la firma cierre)", async () => {
    /*
     * El default ya NO existe en el código: el firmante y el verificador leen
     * los dos `leerSecretoJwt()`. Así que el valor comprometido vive acá, en el
     * test —que no se publica— y se prueba contra el digest de verificarJwt.ts:
     * si alguien cambia el digest sin cambiar este valor, el test avisa.
     */
    const porDefecto = "security-suite-secret-key";
    const verificador = fs.readFileSync(path.join(process.cwd(), "src/lib/auth/verificarJwt.ts"), "utf8");
    const digest = crypto.createHash("sha256").update(porDefecto).digest("hex");
    esperar(
      verificador.includes(digest),
      "el digest del secreto de compromiso de verificarJwt.ts ya no corresponde a este valor",
    );

    const e = espiar({ usuario: ROOT });
    const token = jwtDe("dmedaglia", { secreto: porDefecto });
    await conSecreto(porDefecto, () =>
      sinRuido(async () => {
        esperarDenegado(
          await e.guard.requireApiAuth(pedido("GET", "/api/db/usuarios", conToken(token))),
          503,
          "SECRETO_NO_CONFIGURADO",
        );
      }),
    );
    esperarIgual(e.llamadas, 0, "con un secreto conocido no se resuelve a nadie");
  });

  await test("secreto hex: valen las dos derivaciones (GeneXus y /api/db/login)", async () => {
    // GeneXus hace Hex.decode antes de firmar; secapi firma con el string UTF-8.
    // El panel de secapi entra con tokens de GeneXus, así que si el guard
    // probara una sola derivación rompería a la mitad de los usuarios.
    const secretoHex = "a3f1c0de4b5e6f7089abcdef0123456789abcdef0123456789abcdef01234567";
    await conSecreto(secretoHex, async () => {
      const e = espiar({ usuario: COMUN });
      const comoGenexus = jwt.sign({ username: "jperez" }, Buffer.from(secretoHex, "hex"), {
        algorithm: "HS256",
        expiresIn: SEGUNDOS_7_DIAS,
      });
      const comoSecapi = jwtDe("jperez", { secreto: secretoHex });
      esperar(
        (await e.guard.requireApiAuth(pedido("GET", "/api/db/usuarios", conToken(comoGenexus)))).ok,
        "el token estilo GeneXus tendría que pasar",
      );
      esperar(
        (await e.guard.requireApiAuth(pedido("GET", "/api/db/usuarios", conToken(comoSecapi)))).ok,
        "el token estilo /api/db/login tendría que pasar",
      );
    });
  });

  // ── Rutas públicas y privadas ─────────────────────────────────────────────

  await test("POST /api/db/login sigue público (sin token, sin api-key)", async () => {
    const e = espiar({ usuario: null });
    const r = await e.guard.requireApiAuth(pedido("POST", "/api/db/login"));
    esperar(r.ok, "el login NO puede pedir credencial: es la puerta de entrada");
    if (r.ok) esperarIgual(r.nivel, "PUBLICA", "nivel");
    esperarIgual(e.llamadas, 0, "el login no resuelve usuario en el guard");
  });

  await test("las escrituras que estaban abiertas ahora cortan sin token", async () => {
    const e = espiar({ usuario: ROOT });
    const casos: Array<[string, string]> = [
      ["POST", "/api/db/usuarios"],
      ["PUT", "/api/db/usuarios/7"],
      ["DELETE", "/api/db/usuarios/7"],
      ["PUT", "/api/db/usuarios/7/roles"],
      ["DELETE", "/api/db/aplicaciones/3"],
      ["POST", "/api/db/accesos"],
      ["DELETE", "/api/db/accesos"],
      ["PUT", "/api/db/menu/builder"],
      ["POST", "/api/db/roles/5/clonar"],
      ["DELETE", "/api/db/funcionalidades/9"],
    ];
    for (const [metodo, ruta] of casos) {
      esperarDenegado(await e.guard.requireApiAuth(pedido(metodo, ruta)), 401, "SIN_TOKEN");
    }
  });

  await test("GET /api/db/menu ya no falla abierto: sin token es 401", async () => {
    const e = espiar({ usuario: COMUN });
    esperarDenegado(
      await e.guard.requireApiAuth(pedido("GET", "/api/db/menu?aplicacionId=3")),
      401,
      "SIN_TOKEN",
    );
  });

  await test("ruta sin política declarada: 403 SIN_POLITICA (fail-closed)", async () => {
    const e = espiar({ usuario: ROOT });
    await sinRuido(async () => {
      esperarDenegado(
        await e.guard.requireApiAuth(
          pedido("GET", "/api/db/inventada", conToken(jwtDe("dmedaglia"))),
        ),
        403,
        "SIN_POLITICA",
      );
    });
  });

  await test("método no declarado para una ruta que sí existe: 403 SIN_POLITICA", async () => {
    const e = espiar({ usuario: ROOT });
    await sinRuido(async () => {
      esperarDenegado(
        await e.guard.requireApiAuth(pedido("DELETE", "/api/db/login", conToken(jwtDe("dmedaglia")))),
        403,
        "SIN_POLITICA",
      );
    });
  });

  await test("el segmento literal le gana al dinámico, como en el router de Next", async () => {
    // Si `/usuarios/:id` ganara sobre `/usuarios/externos`, la política aplicada
    // sería la equivocada sin que nadie se entere.
    esperarIgual(nivelDeRuta("/api/db/usuarios/externos", "GET"), "AUTENTICADA", "externos");
    esperarIgual(nivelDeRuta("/api/db/usuarios/importar", "POST"), "ROOT", "importar");
    esperarIgual(nivelDeRuta("/api/db/usuarios/por-username", "GET"), "SERVICIO", "por-username");
    esperarIgual(nivelDeRuta("/api/db/usuarios/77", "GET"), "AUTENTICADA", "usuarios/:id");
    esperarIgual(nivelDeRuta("/api/db/menu/builder", "GET"), "AUTENTICADA", "menu/builder");
  });

  await test("fuera de /api/db no hay política: se deniega", async () => {
    esperarIgual(nivelDeRuta("/api/docs/spec", "GET"), null, "otra familia de rutas");
    esperarIgual(nivelDeRuta("/api/db", "GET"), null, "la raíz del prefijo");
  });

  // ── Nivel ROOT ────────────────────────────────────────────────────────────

  await test("nivel ROOT: un usuario común recibe 403 NO_ROOT", async () => {
    const e = espiar({ usuario: COMUN });
    esperarDenegado(
      await e.guard.requireApiAuth(
        pedido("POST", "/api/db/usuarios/importar", conToken(jwtDe("jperez"))),
      ),
      403,
      "NO_ROOT",
    );
  });

  await test("nivel ROOT: root de OTRA aplicación recibe 403 NO_ROOT", async () => {
    const e = espiar({ usuario: ROOT_DE_OTRA_APP });
    await sinRuido(async () => {
      esperarDenegado(
        await e.guard.requireApiAuth(
          pedido("POST", "/api/db/usuarios/importar", conToken(jwtDe("root-de-goya"))),
        ),
        403,
        "NO_ROOT",
      );
    });
  });

  await test("nivel ROOT: el root pasa", async () => {
    const e = espiar({ usuario: ROOT });
    const r = await e.guard.requireApiAuth(
      pedido("POST", "/api/db/usuarios/importar", conToken(jwtDe("dmedaglia"))),
    );
    esperar(r.ok, "el root tendría que pasar");
    if (r.ok) esperarIgual(r.nivel, "ROOT", "nivel");
  });

  // ── Nivel ROOT: los endpoints que otorgan permisos ────────────────────────
  //
  // Este bloque es LA red que impide que vuelva la escalada a root. Desde que
  // root es el rol "Root" y no la columna `usuarios.es_root`, el privilegio
  // vive en `usuario_roles`; mientras estos endpoints estuvieron en nivel
  // AUTENTICADA, cualquiera de los 854 usuarios se hacía root de todo con un
  // request (`PUT /usuarios/<yo>/roles {"roles":[{"rolId":57}]}`), o fabricaba
  // el rol (`POST /roles {"aplicacionId":1,"nombre":"root"}`) porque el rol se
  // identifica por NOMBRE.

  /** Las escrituras que pueden alterar quién tiene qué. Todas nivel ROOT. */
  const ESCRITURAS_QUE_OTORGAN: Array<[string, string]> = [
    ["PUT", "/api/db/usuarios/845/roles"],
    ["PUT", "/api/db/usuarios/845/accesos"],
    ["DELETE", "/api/db/usuarios/845"],
    ["POST", "/api/db/accesos"],
    ["DELETE", "/api/db/accesos?usuarioId=845&funcionalidadId=1"],
    ["POST", "/api/db/roles"],
    ["PUT", "/api/db/roles/57"],
    ["DELETE", "/api/db/roles/57"],
    ["POST", "/api/db/roles/57/clonar"],
    ["POST", "/api/db/funcionalidades"],
    ["PUT", "/api/db/funcionalidades/9"],
    ["DELETE", "/api/db/funcionalidades/9"],
    ["PUT", "/api/db/funcionalidades/9/acciones"],
    ["POST", "/api/db/objetos"],
    ["PUT", "/api/db/objetos/9"],
    ["DELETE", "/api/db/objetos/9"],
    ["POST", "/api/db/aplicaciones"],
    ["PUT", "/api/db/aplicaciones/1"],
    ["DELETE", "/api/db/aplicaciones/1"],
    ["PUT", "/api/db/menu/builder"],
  ];

  await test("un AUTENTICADO sin rol Root recibe 403 en todo lo que otorga permisos", async () => {
    const e = espiar({ usuario: COMUN });
    for (const [metodo, ruta] of ESCRITURAS_QUE_OTORGAN) {
      esperarDenegado(await e.guard.requireApiAuth(pedido(metodo, ruta, conToken(jwtDe("jperez")))), 403, "NO_ROOT");
    }
  });

  await test("root de OTRA aplicación tampoco puede otorgar permisos en secapi", async () => {
    // El Root de GOYA administra GOYA. Repartir roles del ecosistema es del
    // Root de SecuritySuite, que es donde se configura quién es root de qué.
    const e = espiar({ usuario: ROOT_DE_OTRA_APP });
    await sinRuido(async () => {
      for (const [metodo, ruta] of ESCRITURAS_QUE_OTORGAN) {
        esperarDenegado(
          await e.guard.requireApiAuth(pedido(metodo, ruta, conToken(jwtDe("root-de-goya")))),
          403,
          "NO_ROOT",
        );
      }
    });
  });

  await test("el root sí puede otorgar permisos", async () => {
    const e = espiar({ usuario: ROOT });
    for (const [metodo, ruta] of ESCRITURAS_QUE_OTORGAN) {
      const r = await e.guard.requireApiAuth(pedido(metodo, ruta, conToken(jwtDe("dmedaglia"))));
      esperar(r.ok, `${metodo} ${ruta} tendría que pasar para el root`);
      if (r.ok) esperarIgual(r.nivel, "ROOT", `nivel de ${metodo} ${ruta}`);
    }
  });

  await test("la escalada de un request ya no existe", async () => {
    // El request textual del informe de revisión, contra el guard real.
    const e = espiar({ usuario: COMUN });
    esperarDenegado(
      await e.guard.requireApiAuth(pedido("PUT", "/api/db/usuarios/3/roles", conToken(jwtDe("jperez")))),
      403,
      "NO_ROOT",
    );
    // Y la segunda puerta: fabricar un rol llamado "Root" para asignárselo.
    esperarDenegado(
      await e.guard.requireApiAuth(pedido("POST", "/api/db/roles", conToken(jwtDe("jperez")))),
      403,
      "NO_ROOT",
    );
    esperarIgual(e.llamadas, 2, "las dos veces se resolvió el usuario antes de denegar");
  });

  await test("las LECTURAS del panel siguen abiertas al autenticado común", async () => {
    // El corte es escritura/lectura: si esto se rompe, subimos de más y el
    // panel deja de funcionar para todos menos dos personas.
    const e = espiar({ usuario: COMUN });
    const lecturas: Array<[string, string]> = [
      ["GET", "/api/db/usuarios/845/roles"],
      ["GET", "/api/db/usuarios/845/accesos"],
      ["GET", "/api/db/usuarios/845"],
      ["GET", "/api/db/accesos"],
      ["GET", "/api/db/roles/57"],
      ["GET", "/api/db/funcionalidades"],
      ["GET", "/api/db/objetos"],
      ["GET", "/api/db/aplicaciones"],
      ["GET", "/api/db/menu/builder"],
      ["GET", "/api/db/menu"],
      ["GET", "/api/db/usuarios/yo"],
      ["POST", "/api/db/permisos"],
      ["POST", "/api/db/solicitudes"],
    ];
    for (const [metodo, ruta] of lecturas) {
      const r = await e.guard.requireApiAuth(pedido(metodo, ruta, conToken(jwtDe("jperez"))));
      esperar(r.ok, `${metodo} ${ruta} tendría que seguir abierto al autenticado común`);
    }
  });

  await test("el GET de /roles sigue siendo SERVICIO: no se rompe el edge de Granel", async () => {
    // El POST subió a ROOT y el GET del MISMO path tiene que quedar en
    // SERVICIO. Si al subir el POST alguien toca el GET, el login de Granel se
    // cae con "secapi roles HTTP 401".
    esperarIgual(nivelDeRuta("/api/db/roles", "GET"), "SERVICIO", "GET /roles");
    esperarIgual(nivelDeRuta("/api/db/roles", "POST"), "ROOT", "POST /roles");
    esperarIgual(nivelDeRuta("/api/db/roles/12/atributos", "GET"), "SERVICIO", "GET atributos");
    esperarIgual(nivelDeRuta("/api/db/roles/12/atributos", "PUT"), "SERVICIO", "PUT atributos");

    await conClaveServicio(CLAVE_SERVICIO, async () => {
      const e = espiar({ usuario: null });
      const r = await e.guard.requireApiAuth(
        pedido("GET", "/api/db/roles?aplicacionId=6&pageSize=200", { "x-api-key": CLAVE_SERVICIO }),
      );
      esperar(r.ok, "el edge de Granel tiene que seguir leyendo los roles");
    });
  });

  await test("la api-key de servicio NO alcanza las escrituras que otorgan permisos", async () => {
    await conClaveServicio(CLAVE_SERVICIO, () =>
      sinRuido(async () => {
        const e = espiar({ usuario: ROOT });
        for (const [metodo, ruta] of ESCRITURAS_QUE_OTORGAN) {
          esperarDenegado(
            await e.guard.requireApiAuth(pedido(metodo, ruta, { "x-api-key": CLAVE_SERVICIO })),
            403,
            "SERVICIO_FUERA_DE_ALCANCE",
          );
        }
      }),
    );
  });

  await test("import-sgm-preferences ya no entra con una cookie inventada", async () => {
    // Antes alcanzaba con `Cookie: token=x` para disparar un barrido de
    // escrituras sobre toda la base.
    const e = espiar({ usuario: ROOT });
    esperarDenegado(
      await e.guard.requireApiAuth(
        pedido("POST", "/api/db/admin/import-sgm-preferences", { cookie: "token=x" }),
      ),
      401,
      "TOKEN_INVALIDO",
    );
    const noRoot = espiar({ usuario: COMUN });
    esperarDenegado(
      await noRoot.guard.requireApiAuth(
        pedido("POST", "/api/db/admin/import-sgm-preferences", conToken(jwtDe("jperez"))),
      ),
      403,
      "NO_ROOT",
    );
  });

  // ── Api-key de servicio ───────────────────────────────────────────────────

  await test("api-key válida abre los cuatro endpoints del edge de Granel", async () => {
    await conClaveServicio(CLAVE_SERVICIO, async () => {
      const e = espiar({ usuario: null });
      const casos: Array<[string, string]> = [
        ["GET", "/api/db/usuarios/por-username?username=jperez"],
        ["GET", "/api/db/roles?aplicacionId=6&pageSize=200"],
        ["GET", "/api/db/roles/12/atributos"],
        ["PUT", "/api/db/roles/12/atributos"],
      ];
      for (const [metodo, ruta] of casos) {
        const r = await e.guard.requireApiAuth(pedido(metodo, ruta, { "x-api-key": CLAVE_SERVICIO }));
        esperar(r.ok, `${metodo} ${ruta} tendría que pasar con la api-key`);
        if (r.ok) {
          esperarIgual(r.viaServicio, true, "viaServicio");
          esperarIgual(r.usuario, null, "la api-key no es un usuario");
        }
      }
      esperarIgual(e.llamadas, 0, "la api-key no resuelve usuario contra la base");
    });
  });

  await test("la api-key NO es una llave maestra: 403 fuera de su alcance", async () => {
    await conClaveServicio(CLAVE_SERVICIO, () =>
      sinRuido(async () => {
        const e = espiar({ usuario: ROOT });
        const casos: Array<[string, string]> = [
          ["GET", "/api/db/usuarios"],
          ["POST", "/api/db/usuarios"],
          ["DELETE", "/api/db/usuarios/7"],
          ["POST", "/api/db/roles/12/atributos"], // el POST quedó afuera a propósito
          ["POST", "/api/db/usuarios/importar"],
          ["GET", "/api/db/usuarios/externos"],
        ];
        for (const [metodo, ruta] of casos) {
          esperarDenegado(
            await e.guard.requireApiAuth(pedido(metodo, ruta, { "x-api-key": CLAVE_SERVICIO })),
            403,
            "SERVICIO_FUERA_DE_ALCANCE",
          );
        }
      }),
    );
  });

  await test("api-key equivocada: no entra ni siquiera al endpoint de servicio", async () => {
    await conClaveServicio(CLAVE_SERVICIO, () =>
      sinRuido(async () => {
        const e = espiar({ usuario: null });
        esperarDenegado(
          await e.guard.requireApiAuth(
            pedido("GET", "/api/db/usuarios/por-username", { "x-api-key": "no-es-la-clave-pero-es-larga-igual" }),
          ),
          401,
          "SIN_TOKEN",
        );
      }),
    );
  });

  await test("sin SECAPI_SERVICE_KEY seteada, ninguna api-key sirve", async () => {
    await conClaveServicio(undefined, () =>
      sinRuido(async () => {
        const e = espiar({ usuario: null });
        esperarDenegado(
          await e.guard.requireApiAuth(
            pedido("GET", "/api/db/usuarios/por-username", { "x-api-key": CLAVE_SERVICIO }),
          ),
          401,
          "SIN_TOKEN",
        );
      }),
    );
  });

  await test("una SECAPI_SERVICE_KEY corta se ignora (no se acepta a medias)", async () => {
    await conClaveServicio("corta", () =>
      sinRuido(async () => {
        const e = espiar({ usuario: null });
        esperarDenegado(
          await e.guard.requireApiAuth(
            pedido("GET", "/api/db/usuarios/por-username", { "x-api-key": "corta" }),
          ),
          401,
          "SIN_TOKEN",
        );
      }),
    );
  });

  await test("SECAPI_SERVICE_KEY acepta lista por comas (para poder rotar)", async () => {
    const otra = "otra-clave-de-servicio-para-rotacion-9876";
    await conClaveServicio(`${CLAVE_SERVICIO},${otra}`, async () => {
      const e = espiar({ usuario: null });
      for (const clave of [CLAVE_SERVICIO, otra]) {
        const r = await e.guard.requireApiAuth(
          pedido("GET", "/api/db/usuarios/por-username", { "x-api-key": clave }),
        );
        esperar(r.ok, "las dos claves de la lista tendrían que servir");
      }
    });
  });

  await test("un endpoint de servicio también acepta un usuario autenticado", async () => {
    // El panel de secapi llama a `/roles` y a `/roles/{id}/atributos` con la
    // cookie del usuario, no con la api-key: SERVICIO es "o uno o el otro".
    await conClaveServicio(CLAVE_SERVICIO, async () => {
      const e = espiar({ usuario: COMUN });
      const r = await e.guard.requireApiAuth(
        pedido("GET", "/api/db/roles", conToken(jwtDe("jperez"))),
      );
      esperar(r.ok, "el usuario logueado tendría que entrar igual");
      if (r.ok) esperarIgual(r.viaServicio, false, "viaServicio");
    });
  });

  // ── Fail-closed ───────────────────────────────────────────────────────────

  await test("usuario del token inexistente o inactivo: 401 USUARIO_NO_ENCONTRADO", async () => {
    const e = espiar({ usuario: null });
    esperarDenegado(
      await e.guard.requireApiAuth(
        pedido("GET", "/api/db/usuarios", conToken(jwtDe("fantasma"))),
      ),
      401,
      "USUARIO_NO_ENCONTRADO",
    );
  });

  await test("base caída al resolver el usuario: 503 ERROR_GUARD, no un pase libre", async () => {
    const e = espiar({ explota: true });
    await sinRuido(async () => {
      esperarDenegado(
        await e.guard.requireApiAuth(
          pedido("GET", "/api/db/usuarios", conToken(jwtDe("jperez"))),
        ),
        503,
        "ERROR_GUARD",
      );
    });
  });

  await test("el body de la denegación no filtra el código interno", async () => {
    const e = espiar({ usuario: COMUN });
    const r = await e.guard.requireApiAuth(
      pedido("POST", "/api/db/usuarios/importar", conToken(jwtDe("jperez"))),
    );
    esperar(!r.ok, "esperaba denegación");
    if (r.ok) return;
    const body = (await r.respuesta.json()) as { success: boolean; error: string };
    esperarIgual(body.success, false, "success");
    esperar(!body.error.includes("NO_ROOT"), "el code no puede salir en el mensaje");
    esperar(body.error.length > 0, "tiene que haber un mensaje en castellano");
  });

  // ── verificarJwt, la primitiva compartida ─────────────────────────────────

  await test("verificarJwt distingue firma inválida de vencimiento", async () => {
    esperarIgual(verificarJwt(jwtDe("x"), SECRETO_TEST).ok, true, "token bueno");
    const malo = verificarJwt(jwtSinFirmar("x"), SECRETO_TEST);
    esperarIgual(malo.ok, false, "token sin firmar");
    if (!malo.ok) esperarIgual(malo.codigo, "TOKEN_INVALIDO", "codigo");
    const vencido = verificarJwt(jwtDe("x", { expiraEnSegundos: -1 }), SECRETO_TEST);
    esperarIgual(vencido.ok, false, "token vencido");
    if (!vencido.ok) esperarIgual(vencido.codigo, "TOKEN_VENCIDO", "codigo");
  });

  await test("leerSecretoJwt explica por qué no sirve el secreto", async () => {
    await conSecreto(undefined, async () => {
      const r = leerSecretoJwt();
      esperarIgual(r.ok, false, "sin secreto");
      if (!r.ok) esperar(r.motivo.includes("JWT_SECRET"), "el motivo tiene que nombrar la variable");
    });
  });

  // ── Antienvejecimiento: la tabla y el código no se pueden separar ─────────

  console.log("\nAntienvejecimiento (código real vs tabla de políticas)\n");

  const rutas = listarRutasReales();

  await test("hay rutas para revisar (el inventario no está vacío)", async () => {
    esperar(rutas.length > 30, `se encontraron ${rutas.length} route.ts bajo src/app/api/db`);
  });

  await test("TODO handler de /api/db llama al guard", async () => {
    // Elegimos helper por ruta en vez de middleware; el precio es que una ruta
    // nueva nace abierta. Este test es el que lo cobra.
    const faltan: string[] = [];
    for (const ruta of rutas) {
      for (const { metodo, cuerpo } of cuerposDeHandlers(ruta.fuente)) {
        if (!/\brequireApiAuth\s*\(/.test(cuerpo)) faltan.push(`${metodo} ${ruta.archivo}`);
      }
    }
    esperar(faltan.length === 0, `handlers sin guard:\n      ${faltan.join("\n      ")}`);
  });

  await test("TODO método exportado tiene política declarada", async () => {
    const faltan: string[] = [];
    for (const ruta of rutas) {
      const [base, query] = [ruta.ejemplo, ""];
      for (const metodo of ruta.metodos) {
        if (nivelDeRuta(base + query, metodo) === null) faltan.push(`${metodo} ${ruta.patron}`);
      }
    }
    esperar(faltan.length === 0, `sin política en POLITICAS:\n      ${faltan.join("\n      ")}`);
  });

  await test("no hay políticas huérfanas (patrón o método que ya no existe)", async () => {
    const reales = new Set<string>();
    for (const ruta of rutas) for (const m of ruta.metodos) reales.add(`${m} ${ruta.patron}`);

    const huerfanas: string[] = [];
    for (const p of POLITICAS) {
      for (const m of p.metodos) {
        if (!reales.has(`${m} ${p.patron}`)) huerfanas.push(`${m} ${p.patron}`);
      }
    }
    esperar(huerfanas.length === 0, `políticas sin ruta real:\n      ${huerfanas.join("\n      ")}`);
  });

  await test("solo /api/db/login quedó público", async () => {
    const publicas: string[] = [];
    for (const p of POLITICAS) {
      if (p.nivel === "PUBLICA") for (const m of p.metodos) publicas.push(`${m} ${p.patron}`);
    }
    esperarIgual(publicas.join(" | "), "POST /login", "endpoints públicos");
  });

  await test("el alcance de la api-key son cuatro operaciones y ni una más", async () => {
    // Si mañana alguien suma un endpoint a SERVICIO, que sea una decisión y no
    // un descuido: este test lo hace visible en el diff.
    const servicio: string[] = [];
    for (const p of POLITICAS) {
      if (p.nivel === "SERVICIO") for (const m of p.metodos) servicio.push(`${m} ${p.patron}`);
    }
    esperarIgual(
      servicio.sort().join(" | "),
      [
        "GET /roles",
        "GET /roles/:id/atributos",
        "GET /usuarios/por-username",
        "PUT /roles/:id/atributos",
      ].join(" | "),
      "alcance de SECAPI_SERVICE_KEY",
    );
  });

  await test("no volvió ningún decodificador de JWT sin verificar", async () => {
    // `JSON.parse(atob(...))` sobre el payload es exactamente el agujero que se
    // cerró. Si reaparece en el camino de autenticación, este test lo caza.
    const archivos = [
      "src/lib/permisos.ts",
      "src/app/api/db/permisos/route.ts",
      "src/app/api/db/menu/route.ts",
    ];
    for (const rel of archivos) {
      // Sin comentarios: los tres archivos EXPLICAN el agujero viejo nombrando
      // `atob`, y eso hay que dejarlo escrito — lo que no puede volver es el
      // código que lo llama.
      const fuente = fs
        .readFileSync(path.join(process.cwd(), rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "");
      esperar(!/\batob\s*\(/.test(fuente), `${rel} volvió a decodificar el JWT con atob()`);
    }
  });

  // ── Resultado ─────────────────────────────────────────────────────────────

  console.log(`\n${pasaron} ok, ${fallaron.length} fallidos${fallaron.length ? ": " + fallaron.join(", ") : ""}\n`);
  if (fallaron.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
