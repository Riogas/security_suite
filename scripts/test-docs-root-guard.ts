/**
 * scripts/test-docs-root-guard.ts
 *
 * Test del gate solo-root del portal `/docs` (src/lib/docs/root-guard.ts).
 *
 * El repo no tiene runner de tests, así que esto es un script `tsx` con sus
 * propias aserciones — el mismo formato que el resto de scripts/. Se corre con:
 *
 *   pnpm test            (alias)
 *   pnpm test:docs-guard
 *
 * NO toca la base ni la red: el guard se construye con `crearGuardRoot()` y
 * dependencias falsas. Lo que se verifica es la decisión del guard, no Prisma.
 * Los JWT son reales (firmados con `jsonwebtoken`), porque desde el blindaje el
 * guard verifica firma y vencimiento antes de mirar nada más.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import {
  crearGuardRoot,
  filtroOtorgamientoDocs,
  type DependenciasGuard,
  type ResultadoGuard,
} from "../src/lib/docs/root-guard";
import type { UsuarioAuth } from "../src/lib/permisos";

// El guard lee JWT_SECRET en cada request y exige que sea un secreto real: sin
// esto, TODOS los casos darían 503 SECRETO_NO_CONFIGURADO.
const SECRETO_TEST = "secreto-de-prueba-solo-para-este-script";
process.env.JWT_SECRET = SECRETO_TEST;

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

function esperarDenegado(r: ResultadoGuard, status: number, code: string): void {
  esperar(!r.ok, `esperaba denegación, vino ok=true`);
  if (r.ok) return;
  esperarIgual(r.status, status, "status");
  esperarIgual(r.code, code, "code");
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

/** El guard loguea a propósito los errores y la mala configuración. */
async function sinRuido(fn: () => Promise<void>): Promise<void> {
  const original = console.error;
  console.error = () => {};
  try {
    await fn();
  } finally {
    console.error = original;
  }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Fixtures ───────────────────────────────────────────────────────────────

// Root = rol "Root" de la aplicación 1 (SecuritySuite), ya resuelto por
// `resolveUsuario`. La columna `usuarios.es_root` ya no entra en `UsuarioAuth`.
const ROOT: UsuarioAuth = {
  id: 1,
  username: "dmedaglia",
  esRootDeSecapi: true,
  aplicacionesRoot: [1],
};
// No es root: entra por la funcionalidad `docs` otorgada a alguno de sus roles.
const CON_ROL_ROOT: UsuarioAuth = {
  id: 2,
  username: "con-rol-root",
  esRootDeSecapi: false,
  aplicacionesRoot: [],
};
const COMUN: UsuarioAuth = {
  id: 3,
  username: "usuario-comun",
  esRootDeSecapi: false,
  aplicacionesRoot: [],
};

const SEGUNDOS_7_DIAS = 7 * 24 * 60 * 60;

/** JWT real, firmado. Por defecto con el secreto del test y vigente 7 días. */
function jwtDe(
  username: string,
  opciones: { secreto?: string; expiraEnSegundos?: number } = {},
): string {
  const { secreto = SECRETO_TEST, expiraEnSegundos = SEGUNDOS_7_DIAS } = opciones;
  return jwt.sign(
    { iss: "security-suite", username, userId: 99, sistema: "SecuritySuite" },
    secreto,
    { expiresIn: expiraEnSegundos },
  );
}

/** Firma como GeneXus: cuando el secreto es 64 hex, la librería `GeneXusJWT`
 *  hace `Hex.decode` y firma con esos 32 bytes, no con el string. */
function jwtEstiloGenexus(
  username: string,
  secretoHex: string,
  opciones: { expiraEnSegundos?: number } = {},
): string {
  const { expiraEnSegundos = SEGUNDOS_7_DIAS } = opciones;
  return jwt.sign({ iss: "security-suite", username }, Buffer.from(secretoHex, "hex"), {
    expiresIn: expiraEnSegundos,
  });
}

/** El token que fabricaba cualquiera antes del blindaje: base64 y una firma de mentira. */
function jwtSinFirmar(username: string): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url").replace(/=+$/, "");
  return [
    b64({ alg: "HS256", typ: "JWT" }),
    b64({ iss: "security-suite", username, userId: 99, sistema: "SecuritySuite" }),
    "firma-inventada",
  ].join(".");
}

interface Espia {
  deps: DependenciasGuard;
  llamadasResolve: number;
  llamadasFuncionalidad: number;
  reloj: number;
}

/**
 * Dependencias falsas. `usuarios` mapea username → usuario (ausente = no existe);
 * `conDocs` son los ids con la funcionalidad `docs` otorgada; `explota` simula
 * la base caída.
 */
function espiar(opciones: {
  usuarios?: Record<string, UsuarioAuth>;
  conDocs?: number[];
  explota?: "resolve" | "funcionalidad";
}): Espia {
  const { usuarios = {}, conDocs = [], explota } = opciones;
  const espia = {
    llamadasResolve: 0,
    llamadasFuncionalidad: 0,
    reloj: 1_000_000,
  } as Espia;

  espia.deps = {
    async resolveUsuario(req: NextRequest) {
      espia.llamadasResolve++;
      if (explota === "resolve") throw new Error("Can't reach database server");
      const auth = req.headers.get("authorization") ?? "";
      const payload = jwt.decode(auth.replace("Bearer ", "")) as { username: string } | null;
      return (payload && usuarios[payload.username]) ?? null;
    },
    async tieneFuncionalidadDocs(usuarioId: number) {
      espia.llamadasFuncionalidad++;
      if (explota === "funcionalidad") throw new Error("Can't reach database server");
      return conDocs.includes(usuarioId);
    },
    ahora: () => espia.reloj,
  };

  return espia;
}

const conRequest = (headers: Record<string, string>) =>
  new NextRequest("http://localhost:4005/api/docs/spec", { headers });

/**
 * El secreto que quedó como default en el código, leído del propio código.
 * No se transcribe acá: si alguien lo cambia, el test sigue apuntando al valor
 * vigente y el guard tiene que seguir rechazándolo.
 */
/*
 * El secreto que quedó como default en el código durante mucho tiempo, y que
 * por eso hay que dar por conocido. Antes se leía del propio código con una
 * regex; desde el cierre de /api/db ya no está en ningún archivo de `src`, así
 * que vive acá —en un test, que no se publica— y se prueba contra el digest de
 * `verificarJwt.ts`: si alguien cambia el digest sin cambiar este valor, el
 * test avisa en vez de quedarse mudo.
 */
const SECRETO_DE_COMPROMISO = "security-suite-secret-key";

function secretoPorDefectoDelCodigo(): string {
  const verificador = fs.readFileSync(
    path.join(process.cwd(), "src/lib/auth/verificarJwt.ts"),
    "utf8",
  );
  const digest = crypto.createHash("sha256").update(SECRETO_DE_COMPROMISO).digest("hex");
  if (!verificador.includes(digest)) {
    throw new Error(
      "el digest del secreto de compromiso de verificarJwt.ts ya no corresponde a SECRETO_DE_COMPROMISO",
    );
  }
  return SECRETO_DE_COMPROMISO;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\nGate solo-root de /docs (src/lib/docs/root-guard.ts)\n");

  // ── Verificación del token: firma, vencimiento y secreto ──────────────────

  await test("token válido y firmado pasa (root por el rol Root de secapi)", async () => {
    const e = espiar({ usuarios: { dmedaglia: ROOT } });
    const { requireRoot } = crearGuardRoot(e.deps);

    const r = await requireRoot(conRequest({ authorization: `Bearer ${jwtDe("dmedaglia")}` }));

    esperar(r.ok, "el root con token firmado tendría que pasar");
    if (r.ok) esperarIgual(r.usuario.username, "dmedaglia", "usuario devuelto");
    esperarIgual(e.llamadasFuncionalidad, 0, "consultas a rol_funcionalidades");
  });

  await test("token firmado con OTRO secreto: 401 TOKEN_INVALIDO", async () => {
    const e = espiar({ usuarios: { dmedaglia: ROOT } });
    const { requireRoot } = crearGuardRoot(e.deps);

    const impostor = jwtDe("dmedaglia", { secreto: "otro-secreto-cualquiera" });
    esperarDenegado(
      await requireRoot(conRequest({ authorization: `Bearer ${impostor}` })),
      401,
      "TOKEN_INVALIDO",
    );
    esperarIgual(e.llamadasResolve, 0, "no se consulta la base con firma inválida");
  });

  await test("token armado a mano, sin firmar: 401 TOKEN_INVALIDO", async () => {
    // Este es EL caso: antes del blindaje, este token entraba como root.
    const e = espiar({ usuarios: { dmedaglia: ROOT } });
    const { requireRoot } = crearGuardRoot(e.deps);

    esperarDenegado(
      await requireRoot(conRequest({ authorization: `Bearer ${jwtSinFirmar("dmedaglia")}` })),
      401,
      "TOKEN_INVALIDO",
    );
    esperarIgual(e.llamadasResolve, 0, "no se consulta la base con firma inválida");
  });

  // ── Doble derivación del secreto (GeneXus firma con hex-decode) ────────────

  await test("secreto hex: acepta un token firmado estilo GeneXus (hex-decode)", async () => {
    const secretoHex = "a3f1c0de4b5e6f7089abcdef0123456789abcdef0123456789abcdef01234567";
    const previo = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secretoHex;
    try {
      const e = espiar({ usuarios: { dmedaglia: ROOT } });
      const { requireRoot } = crearGuardRoot(e.deps);
      const token = jwtEstiloGenexus("dmedaglia", secretoHex);
      const r = await requireRoot(conRequest({ authorization: `Bearer ${token}` }));
      esperar(r.ok, "el token que firma GeneXus (hex-decode) tendría que pasar");
    } finally {
      process.env.JWT_SECRET = previo;
    }
  });

  await test("secreto hex: acepta también el token estilo /api/db/login (UTF-8)", async () => {
    const secretoHex = "a3f1c0de4b5e6f7089abcdef0123456789abcdef0123456789abcdef01234567";
    const previo = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secretoHex;
    try {
      const e = espiar({ usuarios: { dmedaglia: ROOT } });
      const { requireRoot } = crearGuardRoot(e.deps);
      const token = jwtDe("dmedaglia", { secreto: secretoHex }); // firma con el string
      const r = await requireRoot(conRequest({ authorization: `Bearer ${token}` }));
      esperar(r.ok, "el token que firma secapi (UTF-8) tendría que seguir pasando");
    } finally {
      process.env.JWT_SECRET = previo;
    }
  });

  await test("secreto hex: un token firmado con OTRA clave hex sigue siendo 401", async () => {
    const secretoHex = "a3f1c0de4b5e6f7089abcdef0123456789abcdef0123456789abcdef01234567";
    const previo = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secretoHex;
    try {
      const e = espiar({ usuarios: { dmedaglia: ROOT } });
      const { requireRoot } = crearGuardRoot(e.deps);
      const impostor = jwtEstiloGenexus(
        "dmedaglia",
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      );
      esperarDenegado(
        await requireRoot(conRequest({ authorization: `Bearer ${impostor}` })),
        401,
        "TOKEN_INVALIDO",
      );
    } finally {
      process.env.JWT_SECRET = previo;
    }
  });

  await test("token vencido: 401 TOKEN_VENCIDO", async () => {
    const e = espiar({ usuarios: { dmedaglia: ROOT } });
    const { requireRoot } = crearGuardRoot(e.deps);

    const vencido = jwtDe("dmedaglia", { expiraEnSegundos: -60 });
    esperarDenegado(
      await requireRoot(conRequest({ authorization: `Bearer ${vencido}` })),
      401,
      "TOKEN_VENCIDO",
    );
    esperarIgual(e.llamadasResolve, 0, "no se consulta la base con token vencido");
  });

  await test("el vencimiento se mira SIEMPRE, aunque el positivo esté cacheado", async () => {
    const e = espiar({ usuarios: { dmedaglia: ROOT } });
    const { requireRoot } = crearGuardRoot(e.deps);
    const token = jwtDe("dmedaglia", { expiraEnSegundos: 1 });
    const req = () => conRequest({ authorization: `Bearer ${token}` });

    esperar((await requireRoot(req())).ok, "mientras está vigente tiene que pasar");
    await dormir(1500); // el reloj del cache no se mueve: solo vence el token

    esperarDenegado(await requireRoot(req()), 401, "TOKEN_VENCIDO");
  });

  await test("sin JWT_SECRET: 503 SECRETO_NO_CONFIGURADO (fail-closed)", async () => {
    const e = espiar({ usuarios: { dmedaglia: ROOT } });
    const { requireRoot } = crearGuardRoot(e.deps);
    const token = jwtDe("dmedaglia");

    await conSecreto(undefined, () =>
      sinRuido(async () => {
        esperarDenegado(
          await requireRoot(conRequest({ authorization: `Bearer ${token}` })),
          503,
          "SECRETO_NO_CONFIGURADO",
        );
      }),
    );
    esperarIgual(e.llamadasResolve, 0, "no se consulta la base sin secreto configurado");
  });

  await test("JWT_SECRET vacía: 503 SECRETO_NO_CONFIGURADO", async () => {
    const e = espiar({ usuarios: { dmedaglia: ROOT } });
    const { requireRoot } = crearGuardRoot(e.deps);
    const token = jwtDe("dmedaglia");

    await conSecreto("   ", () =>
      sinRuido(async () => {
        esperarDenegado(
          await requireRoot(conRequest({ authorization: `Bearer ${token}` })),
          503,
          "SECRETO_NO_CONFIGURADO",
        );
      }),
    );
  });

  await test("JWT_SECRET igual al default del código: 503 SECRETO_NO_CONFIGURADO", async () => {
    const porDefecto = secretoPorDefectoDelCodigo();
    const e = espiar({ usuarios: { dmedaglia: ROOT } });
    const { requireRoot } = crearGuardRoot(e.deps);
    // Token firmado con ESE secreto: la firma verifica, y aun así no se abre.
    const token = jwtDe("dmedaglia", { secreto: porDefecto });

    await conSecreto(porDefecto, () =>
      sinRuido(async () => {
        esperarDenegado(
          await requireRoot(conRequest({ authorization: `Bearer ${token}` })),
          503,
          "SECRETO_NO_CONFIGURADO",
        );
      }),
    );
  });

  await test("el default del secreto quedó en un solo lugar (el que firma)", async () => {
    // Antes había DOS: `src/lib/auth/responses.ts` (firma) y
    // `src/app/api/db/menu/route.ts` (verificaba). Este test los comparaba para
    // que el digest de arriba no terminara apuntando al equivocado.
    //
    // El de /api/db/menu ya no existe: esa ruta dejó de verificar por su cuenta
    // y ahora entra por el guard central (src/lib/auth/apiGuard.ts), que lee el
    // secreto con `leerSecretoJwt` y se niega a trabajar si es el default. Que
    // ese literal NO vuelva a aparecer es parte de lo que hay que sostener: un
    // segundo default es un segundo criterio.
    // Y desde el cierre de /api/db tampoco lo tiene el que firma: `responses.ts`
    // pasó a usar `leerSecretoJwt()`, el MISMO criterio del verificador. Sin
    // JWT_SECRET válida el login corta con 503 en vez de emitir un token que
    // después nadie puede usar. O sea: el default ya no vive en ningún lado, y
    // eso es lo que hay que sostener.
    for (const archivo of [
      "src/lib/auth/responses.ts",
      "src/app/api/db/menu/route.ts",
      "src/lib/permisos.ts",
    ]) {
      const fuente = fs.readFileSync(path.join(process.cwd(), archivo), "utf8");
      esperar(
        !/JWT_SECRET\s*\|\|\s*"/.test(fuente),
        `${archivo} no puede tener un default de JWT_SECRET: un segundo default es un segundo criterio`,
      );
    }
  });

  await test("el 503 por secreto no se cachea: al configurarlo, entra", async () => {
    const e = espiar({ usuarios: { dmedaglia: ROOT } });
    const { requireRoot } = crearGuardRoot(e.deps);
    const token = jwtDe("dmedaglia");
    const req = () => conRequest({ authorization: `Bearer ${token}` });

    await conSecreto(undefined, () =>
      sinRuido(async () => {
        esperarDenegado(await requireRoot(req()), 503, "SECRETO_NO_CONFIGURADO");
      }),
    );
    esperar((await requireRoot(req())).ok, "con el secreto puesto tendría que entrar");
  });

  // ── Resolución de root ────────────────────────────────────────────────────

  await test("root por rol (funcionalidad 'docs' otorgada) pasa", async () => {
    const e = espiar({ usuarios: { "con-rol-root": CON_ROL_ROOT }, conDocs: [CON_ROL_ROOT.id] });
    const { requireRoot } = crearGuardRoot(e.deps);

    const r = await requireRoot(conRequest({ authorization: `Bearer ${jwtDe("con-rol-root")}` }));

    esperar(r.ok, "el usuario con rol Root tendría que pasar");
    esperarIgual(e.llamadasFuncionalidad, 1, "consultas a rol_funcionalidades");
  });

  await test("no-root recibe 403 NO_ROOT", async () => {
    const e = espiar({ usuarios: { "usuario-comun": COMUN }, conDocs: [] });
    const { requireRoot } = crearGuardRoot(e.deps);

    const r = await requireRoot(conRequest({ authorization: `Bearer ${jwtDe("usuario-comun")}` }));

    esperarDenegado(r, 403, "NO_ROOT");
  });

  await test("el token también se toma de la cookie 'token'", async () => {
    const e = espiar({ usuarios: { dmedaglia: ROOT } });
    const { requireRoot } = crearGuardRoot(e.deps);

    const r = await requireRoot(conRequest({ cookie: `token=${jwtDe("dmedaglia")}` }));

    esperar(r.ok, "la cookie tendría que servir igual que el header");
  });

  await test("sin token: 401 SIN_TOKEN", async () => {
    const e = espiar({ usuarios: { dmedaglia: ROOT } });
    const { requireRoot } = crearGuardRoot(e.deps);

    esperarDenegado(await requireRoot(conRequest({})), 401, "SIN_TOKEN");
    esperarIgual(e.llamadasResolve, 0, "no se resuelve usuario sin token");
  });

  await test("token no decodificable: 401 TOKEN_INVALIDO", async () => {
    const e = espiar({ usuarios: { dmedaglia: ROOT } });
    const { requireRoot } = crearGuardRoot(e.deps);

    esperarDenegado(
      await requireRoot(conRequest({ authorization: "Bearer no-es-un-jwt" })),
      401,
      "TOKEN_INVALIDO",
    );
  });

  await test("usuario del token inexistente o inactivo: 403 USUARIO_NO_ENCONTRADO", async () => {
    const e = espiar({ usuarios: {} });
    const { requireRoot } = crearGuardRoot(e.deps);

    esperarDenegado(
      await requireRoot(conRequest({ authorization: `Bearer ${jwtDe("fantasma")}` })),
      403,
      "USUARIO_NO_ENCONTRADO",
    );
  });

  // El caso "secapi caído": en SecuritySuite el motor de permisos es la propia
  // base, así que "caído" es que Postgres no responda.
  await test("base caída al resolver el usuario: 503 ERROR_GUARD (fail-closed)", async () => {
    const e = espiar({ usuarios: { dmedaglia: ROOT }, explota: "resolve" });
    const { requireRoot } = crearGuardRoot(e.deps);

    await sinRuido(async () => {
      esperarDenegado(
        await requireRoot(conRequest({ authorization: `Bearer ${jwtDe("dmedaglia")}` })),
        503,
        "ERROR_GUARD",
      );
    });
  });

  await test("base caída al chequear la funcionalidad: 503 y NO se cachea", async () => {
    const e = espiar({ usuarios: { "con-rol-root": CON_ROL_ROOT }, explota: "funcionalidad" });
    const { requireRoot } = crearGuardRoot(e.deps);
    const token = jwtDe("con-rol-root");
    const req = () => conRequest({ authorization: `Bearer ${token}` });

    await sinRuido(async () => {
      esperarDenegado(await requireRoot(req()), 503, "ERROR_GUARD");
      esperarDenegado(await requireRoot(req()), 503, "ERROR_GUARD");
    });

    // Si el error se hubiera cacheado, la segunda llamada no habría consultado:
    // un 503 cacheado dejaría el portal caído aunque la base ya haya vuelto.
    esperarIgual(e.llamadasFuncionalidad, 2, "reintentos contra la base");
  });

  // ── Cache ─────────────────────────────────────────────────────────────────

  await test("el positivo se cachea 5 minutos y vence después", async () => {
    const e = espiar({ usuarios: { "con-rol-root": CON_ROL_ROOT }, conDocs: [CON_ROL_ROOT.id] });
    const { requireRoot } = crearGuardRoot(e.deps);
    const token = jwtDe("con-rol-root");
    const req = () => conRequest({ authorization: `Bearer ${token}` });

    esperar((await requireRoot(req())).ok, "primera llamada");
    esperar((await requireRoot(req())).ok, "segunda llamada (cacheada)");
    esperarIgual(e.llamadasResolve, 1, "resoluciones dentro de la ventana de cache");

    e.reloj += 5 * 60 * 1000 + 1;
    esperar((await requireRoot(req())).ok, "tercera llamada (cache vencido)");
    esperarIgual(e.llamadasResolve, 2, "resoluciones después de los 5 min");
  });

  await test("el negativo se cachea solo 30 segundos", async () => {
    const e = espiar({ usuarios: { "usuario-comun": COMUN }, conDocs: [] });
    const { requireRoot } = crearGuardRoot(e.deps);
    const token = jwtDe("usuario-comun");
    const req = () => conRequest({ authorization: `Bearer ${token}` });

    esperarDenegado(await requireRoot(req()), 403, "NO_ROOT");
    esperarDenegado(await requireRoot(req()), 403, "NO_ROOT");
    esperarIgual(e.llamadasResolve, 1, "resoluciones dentro de los 30 s");

    e.reloj += 30 * 1000 + 1;
    esperarDenegado(await requireRoot(req()), 403, "NO_ROOT");
    esperarIgual(e.llamadasResolve, 2, "resoluciones después de los 30 s");
  });

  await test("un alta de rol se ve al vencer el negativo (no queda pegado)", async () => {
    const conDocs: number[] = [];
    const e = espiar({ usuarios: { "con-rol-root": CON_ROL_ROOT }, conDocs });
    const { requireRoot } = crearGuardRoot(e.deps);
    const token = jwtDe("con-rol-root");
    const req = () => conRequest({ authorization: `Bearer ${token}` });

    esperarDenegado(await requireRoot(req()), 403, "NO_ROOT");
    conDocs.push(CON_ROL_ROOT.id); // le dan el rol Root
    e.reloj += 31 * 1000;

    esperar((await requireRoot(req())).ok, "tendría que entrar tras vencer el negativo");
  });

  await test("el cache no indexa por el JWT en claro", async () => {
    // Dos tokens distintos del mismo usuario tienen que resolverse por separado,
    // y ninguna clave del cache puede ser el token tal cual.
    const e = espiar({ usuarios: { dmedaglia: ROOT } });
    const { requireRoot } = crearGuardRoot(e.deps);

    const a = jwtDe("dmedaglia");
    await dormir(1100); // `iat` en segundos: sin esto los dos JWT salen idénticos
    const b = jwtDe("dmedaglia");
    esperar(a !== b, "los dos tokens tendrían que ser distintos");

    esperar((await requireRoot(conRequest({ authorization: `Bearer ${a}` }))).ok, "token A");
    esperar((await requireRoot(conRequest({ authorization: `Bearer ${b}` }))).ok, "token B");
    esperarIgual(e.llamadasResolve, 2, "cada token se evalúa por su cuenta");
  });

  await test("requireRootPorToken deniega con token vacío o nulo", async () => {
    const e = espiar({ usuarios: { dmedaglia: ROOT } });
    const { requireRootPorToken } = crearGuardRoot(e.deps);

    esperarDenegado(await requireRootPorToken(null), 401, "SIN_TOKEN");
    esperarDenegado(await requireRootPorToken("   "), 401, "SIN_TOKEN");
  });

  // ── Filtro contra Postgres ────────────────────────────────────────────────

  await test("el filtro del otorgamiento replica solo_root y la vigencia de la funcionalidad", async () => {
    const ahora = new Date("2026-08-17T12:00:00Z");
    const filtro = filtroOtorgamientoDocs(42, ahora) as {
      funcionalidad: Record<string, unknown>;
      rol: { estado: string; usuarios: { some: Record<string, unknown> } };
    };

    esperarIgual(filtro.funcionalidad.nombre, "docs", "nombre de la funcionalidad");
    esperarIgual(filtro.funcionalidad.estado, "A", "estado de la funcionalidad");
    // solo_root='S' es lo que /api/db/permisos descarta para quien no es root:
    // el bypass de es_root ya se resolvió antes de llegar a esta consulta.
    esperarIgual(filtro.funcionalidad.soloRoot, "N", "solo_root de la funcionalidad");
    esperar(
      JSON.stringify(filtro.funcionalidad.OR).includes("fechaDesde") &&
        JSON.stringify(filtro.funcionalidad.AND).includes("fechaHasta"),
      "la vigencia de la funcionalidad tiene que estar contemplada",
    );
    esperarIgual(filtro.rol.estado, "A", "estado del rol");
    esperarIgual(filtro.rol.usuarios.some.usuarioId, 42, "usuario del otorgamiento");
    esperar(
      JSON.stringify(filtro.rol.usuarios.some.OR).includes("fechaDesde") &&
        JSON.stringify(filtro.rol.usuarios.some.AND).includes("fechaHasta"),
      "la vigencia de la asignación al rol tiene que estar contemplada",
    );
  });

  console.log(
    `\n${pasaron} ok, ${fallaron.length} fallidos${fallaron.length ? `: ${fallaron.join(", ")}` : ""}\n`,
  );
  if (fallaron.length > 0) process.exit(1);
}

void main();
