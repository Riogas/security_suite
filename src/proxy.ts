// src/proxy.ts
// Next 16 renombró el convention "middleware" a "proxy".
// Este archivo sigue siendo el guard de permisos: intercepta cada request,
// genera el code de pantalla, consulta PERMISOS_API_URL e inyecta headers/cookies.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// =========================
// Config
// =========================
const DEBUG = process.env.DEBUG_MW === "1";

// Rutas públicas que no requieren permisos (exactas)
const PUBLIC_PATHS = ["/", "/login", "/no-autorizado"];

// API de permisos. Por defecto usa el endpoint interno Postgres (/api/db/permisos).
// Se puede sobreescribir con PERMISOS_API_URL (ej. para apuntar a otro host).
const PERMISOS_API_URL_OVERRIDE = process.env.PERMISOS_API_URL || "";

// Flag de rollout: si != "1", el guard NO bloquea (comportamiento histórico:
// /dashboard abierto). Encender solo cuando objetos/funcionalidades estén seedeados.
const PERMISOS_ENFORCE = process.env.PERMISOS_ENFORCE === "1";

// Salt para generar códigos de pantalla (cambiarlo regenera todos los códigos)
const ROUTE_SALT = process.env.ROUTE_SALT ?? "s";

// (opcional) nombre amigable por ruta
const ROUTE_META: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /^\/dashboard$/, name: "Dashboard" },
  { pattern: /^\/usuarios$/, name: "Usuarios" },
  { pattern: /^\/pedidos$/, name: "Pedidos" },
  { pattern: /^\/pedidos\/[^/]+$/, name: "Detalle de Pedido" },
];

// AppId para el body
const APP_ID = Number(
  process.env.NEXT_PUBLIC_APLICACION_ID ?? process.env.APLICACION_ID ?? 0,
);

// =========================
// Utils (scope de módulo)
// =========================
function log(...args: any[]) {
  if (DEBUG) console.log("[Proxy]", ...args);
}

function routeName(pathname: string): string {
  return ROUTE_META.find((m) => m.pattern.test(pathname))?.name ?? pathname;
}

// ejemplo: "/dashboard/clientes" → "clientes"
function getObjetoKey(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : "root";
}

// ejemplo: "/dashboard/funcionalidades/crear" → "/funcionalidades/crear"
function getObjetoPath(pathname: string): string {
  const prefix = "/dashboard";
  const p = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : pathname;
  return p || "/";
}

// Genera un código estable por ruta: XXXX-XXXX (Edge-safe usando Web Crypto)
async function routeCode(
  pathname: string,
  salt: string = ROUTE_SALT,
): Promise<string> {
  const enc = new TextEncoder().encode(`${salt}|${pathname}`);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(digest);

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    value = 0,
    out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  const code = out.replace(/[^A-Z2-7]/g, "").slice(0, 8) || "AAAAAAAA";
  return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

// Decodifica el payload de un JWT (sin verificar firma) — Edge-safe
function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(payloadB64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// =========================
// API de permisos
// =========================
async function apiCheckPermisoEdge(
  origin: string,
  pathname: string,
  code: string,
  token: string,
): Promise<boolean> {
  try {
    const body = {
      AplicacionId: APP_ID,
      ObjetoKey: getObjetoKey(pathname), // p.ej. "clientes"
      ObjetoTipo: "PAGE",
      AccionKey: "view",
      AccionCodigo: code, // XXXX-XXXX
      ObjetoPath: getObjetoPath(pathname), // "/funcionalidades/crear"
    };

    const url = PERMISOS_API_URL_OVERRIDE || `${origin}/api/db/permisos`;

    log("→ Checando permiso", url, body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const raw = await resp.text();
    log("permiso status", resp.status, raw);

    if (!resp.ok) return false;

    let json: any = {};
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      // puede no ser JSON
    }

    // /api/db/permisos devuelve { permitido: "GRANTED" | "DENIED" }.
    // Se aceptan también las formas legacy del backend GeneXus.
    const permitido =
      json.permitido === "GRANTED" ||
      json.Permitido === true ||
      json.permitido === true ||
      json.allowed === true ||
      json.ok === true ||
      json.Permitido === "S";

    log("→ permitido?", permitido);
    return permitido;
  } catch (err) {
    console.error("[Proxy] Error checando permiso:", err);
    return false;
  }
}

// =========================
// Proxy (antes "middleware")
// =========================
export async function proxy(request: NextRequest) {
  try {
    console.log("[Proxy] DEBUG_MW =", process.env.DEBUG_MW);

    const { pathname } = request.nextUrl;
    log("→ request", pathname);

    // 0) Assets / sistema: nunca se chequean
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/static") ||
      pathname === "/favicon.ico" ||
      /\.[a-zA-Z0-9]+$/.test(pathname) // archivos de /public (png, svg, js, css, etc.)
    ) {
      return NextResponse.next();
    }

    // 0b) Rollout: si el enforcement está apagado, no bloquear nada
    // (comportamiento histórico: /dashboard abierto).
    if (!PERMISOS_ENFORCE) {
      const res = NextResponse.next();
      res.headers.set("x-mw-hit", "disabled");
      return res;
    }

    // 1) Rutas públicas exactas (login, etc.). Con enforcement encendido,
    // /dashboard YA NO es público: cada pantalla se valida.
    if (PUBLIC_PATHS.includes(pathname)) {
      const res = NextResponse.next();
      res.headers.set("x-mw-hit", "public");
      return res;
    }

  // 2) JWT desde cookie
  const token = request.cookies.get("token")?.value;
  log("token presente?", !!token);
  if (!token) {
    log("sin token → redirect /login");
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 3) Datos de pantalla
  const [code, name] = await Promise.all([
    routeCode(pathname),
    Promise.resolve(routeName(pathname)),
  ]);
  log("code/name calculados:", code, name);

  // 3b) Usuario del JWT (opcional para headers/cookies)
  let userName = "";
  const payload = decodeJwtPayload(token);
  if (payload) {
    const rawName =
      payload.name ||
      payload.username ||
      payload.email ||
      payload.preferred_username ||
      "";
    // Sanitizar el nombre de usuario para headers
    userName = String(rawName).trim().slice(0, 200) || "";
  }
  log("userName decodificado:", userName || "(vacío)");

  // 4) Consultar permisos con pathname + code + token  ✅
  const permitido = await apiCheckPermisoEdge(request.nextUrl.origin, pathname, code, token);
  log("permiso?", permitido);

  if (!permitido) {
    const url = new URL("/no-autorizado", request.url);
    url.searchParams.set("code", code);
    url.searchParams.set("ruta", pathname);
    url.searchParams.set("nombre", name);
    log("NO permitido → redirect", url.toString());
    return NextResponse.redirect(url);
  }

  // 5) Permiso OK → Inyectar headers y cookies espejo
  const reqHeaders = new Headers(request.headers);

  // Sanitizar y validar valores antes de setear headers
  const safeCode = String(code || "").slice(0, 100);
  const safeName = String(name || "").slice(0, 200);
  const safeUserName = userName ? String(userName).slice(0, 200) : "";

  if (safeCode) reqHeaders.set("x-route-code", safeCode);
  if (safeName) reqHeaders.set("x-route-name", safeName);
  if (safeUserName) reqHeaders.set("x-user-name", safeUserName);

  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set("x-mw-hit", "1");
  if (safeCode) {
    res.headers.set("x-route-code", safeCode);
    res.cookies.set("routeCode", safeCode, { path: "/" });
  }
  if (safeName) {
    res.headers.set("x-route-name", safeName);
    res.cookies.set("routeName", safeName, { path: "/" });
  }
  if (safeUserName) {
    res.headers.set("x-user-name", safeUserName);
    res.cookies.set("userName", safeUserName, { path: "/" });
  }

  log("headers set:", {
    "x-route-code": safeCode || "(no-set)",
    "x-route-name": safeName || "(no-set)",
    "x-user-name": safeUserName || "(no-set)",
  });

  return res;
  } catch (error) {
    // Capturar cualquier error del proxy
    console.error("[Proxy] Error:", {
      pathname: request.nextUrl.pathname,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      headers: Object.fromEntries(request.headers.entries()),
    });

    // En caso de error, permitir continuar sin bloquear
    const res = NextResponse.next();
    res.headers.set("x-mw-error", "1");
    return res;
  }
}

// 6) Aplicar a todas las rutas menos APIs y estáticos
// Excluye /api, /_next y cualquier archivo con extensión
export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
