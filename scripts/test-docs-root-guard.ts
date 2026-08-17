/**
 * scripts/test-docs-root-guard.ts
 *
 * Test del gate solo-root del portal `/docs` (src/lib/docs/root-guard.ts).
 *
 * El repo no tiene runner de tests, así que esto es un script `tsx` con sus
 * propias aserciones — el mismo formato que el resto de scripts/. Se corre con:
 *
 *   pnpm test:docs-guard
 *
 * NO toca la base ni la red: el guard se construye con `crearGuardRoot()` y
 * dependencias falsas. Lo que se verifica es la decisión del guard, no Prisma.
 */

import { NextRequest } from "next/server";
import {
  crearGuardRoot,
  type DependenciasGuard,
  type ResultadoGuard,
} from "../src/lib/docs/root-guard";
import type { UsuarioAuth } from "../src/lib/permisos";

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

// ─── Fixtures ───────────────────────────────────────────────────────────────

const ROOT: UsuarioAuth = { id: 1, esRoot: "S", username: "dmedaglia" };
const CON_ROL_ROOT: UsuarioAuth = { id: 2, esRoot: "N", username: "con-rol-root" };
const COMUN: UsuarioAuth = { id: 3, esRoot: "N", username: "usuario-comun" };

/** JWT sintético: solo tiene que sobrevivir a decodeJwt(), la firma no se mira. */
function jwtDe(username: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
  return [
    b64({ alg: "HS256", typ: "JWT" }),
    b64({ iss: "security-suite", username, userId: 99, sistema: "SecuritySuite" }),
    "firma-que-nadie-verifica",
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
      const payload = JSON.parse(
        Buffer.from(auth.replace("Bearer ", "").split(".")[1], "base64").toString("utf8"),
      ) as { username: string };
      return usuarios[payload.username] ?? null;
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

// ─── Tests ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\nGate solo-root de /docs (src/lib/docs/root-guard.ts)\n");

  await test("root por es_root='S' pasa, sin consultar rol_funcionalidades", async () => {
    const e = espiar({ usuarios: { dmedaglia: ROOT } });
    const { requireRoot } = crearGuardRoot(e.deps);

    const r = await requireRoot(conRequest({ authorization: `Bearer ${jwtDe("dmedaglia")}` }));

    esperar(r.ok, "el root tendría que pasar");
    if (r.ok) esperarIgual(r.usuario.username, "dmedaglia", "usuario devuelto");
    esperarIgual(e.llamadasFuncionalidad, 0, "consultas a rol_funcionalidades");
  });

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

    const original = console.error; // el guard loguea el error a propósito
    console.error = () => {};
    try {
      esperarDenegado(
        await requireRoot(conRequest({ authorization: `Bearer ${jwtDe("dmedaglia")}` })),
        503,
        "ERROR_GUARD",
      );
    } finally {
      console.error = original;
    }
  });

  await test("base caída al chequear la funcionalidad: 503 y NO se cachea", async () => {
    const e = espiar({ usuarios: { "con-rol-root": CON_ROL_ROOT }, explota: "funcionalidad" });
    const { requireRoot } = crearGuardRoot(e.deps);
    const req = () => conRequest({ authorization: `Bearer ${jwtDe("con-rol-root")}` });

    const original = console.error;
    console.error = () => {};
    try {
      esperarDenegado(await requireRoot(req()), 503, "ERROR_GUARD");
      esperarDenegado(await requireRoot(req()), 503, "ERROR_GUARD");
    } finally {
      console.error = original;
    }

    // Si el error se hubiera cacheado, la segunda llamada no habría consultado:
    // un 503 cacheado dejaría el portal caído aunque la base ya haya vuelto.
    esperarIgual(e.llamadasFuncionalidad, 2, "reintentos contra la base");
  });

  await test("el positivo se cachea 5 minutos y vence después", async () => {
    const e = espiar({ usuarios: { "con-rol-root": CON_ROL_ROOT }, conDocs: [CON_ROL_ROOT.id] });
    const { requireRoot } = crearGuardRoot(e.deps);
    const req = () => conRequest({ authorization: `Bearer ${jwtDe("con-rol-root")}` });

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
    const req = () => conRequest({ authorization: `Bearer ${jwtDe("usuario-comun")}` });

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
    const req = () => conRequest({ authorization: `Bearer ${jwtDe("con-rol-root")}` });

    esperarDenegado(await requireRoot(req()), 403, "NO_ROOT");
    conDocs.push(CON_ROL_ROOT.id); // le dan el rol Root
    e.reloj += 31 * 1000;

    esperar((await requireRoot(req())).ok, "tendría que entrar tras vencer el negativo");
  });

  await test("requireRootPorToken deniega con token vacío o nulo", async () => {
    const e = espiar({ usuarios: { dmedaglia: ROOT } });
    const { requireRootPorToken } = crearGuardRoot(e.deps);

    esperarDenegado(await requireRootPorToken(null), 401, "SIN_TOKEN");
    esperarDenegado(await requireRootPorToken("   "), 401, "SIN_TOKEN");
  });

  console.log(
    `\n${pasaron} ok, ${fallaron.length} fallidos${fallaron.length ? `: ${fallaron.join(", ")}` : ""}\n`,
  );
  if (fallaron.length > 0) process.exit(1);
}

void main();
