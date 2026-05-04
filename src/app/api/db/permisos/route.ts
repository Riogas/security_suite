import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// =====================================================================
// POST /api/db/permisos
//
// Verifica si el usuario autenticado tiene acceso para uno o varios
// objetos + acciones de una aplicacion dada (Postgres/Prisma).
//
// Headers: Authorization: Bearer <jwt>   (o cookie "token")
//
// Modo single:
//   Body: { aplicacion, ObjetoKey, ObjetoTipo?, AccionKey?, AccionCodigo?, ObjetoPath? }
//   Resp: { permitido: "GRANTED"|"DENIED", razon, objetoKey, accionKey?, accionCodigo?, funcionalidadId? }
//
// Modo batch:
//   Body: { aplicacion, permisos: [ { ObjetoKey, ObjetoTipo?, AccionKey?, AccionCodigo?, ObjetoPath? }, ... ] }
//   Resp: { resultados: [ ...misma shape single... ] }
//
// Flujo:
//   1. JWT -> usuario activo
//   2. esRoot='S' -> GRANTED en todo sin mas checks
//   3. Aplicacion por nombre
//   4. Objeto activo (key + tipo opcional)  -> PUBLIC_OBJECT si esPublico
//   5. ObjetoAccion (filtra accionKey/Codigo/path)
//   6. funcionalidad_objeto_acciones -> Funcionalidades activas/vigentes
//      -> PUBLIC_FUNCIONALIDAD | SOLO_ROOT
//   7. accesos directo (ALLOW, vigente)
//   8. usuario_roles -> rol_funcionalidades
//   9. ACCESS_DENIED
// =====================================================================

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return req.cookies.get("token")?.value ?? null;
}

type PermisoInput = {
  ObjetoKey:     string;
  ObjetoTipo?:   string;
  AccionKey?:    string;
  AccionCodigo?: string;
  ObjetoPath?:   string;
};

type PermisoResultado = {
  permitido:        "GRANTED" | "DENIED";
  razon:            string;
  objetoKey:        string;
  accionKey?:       string;
  accionCodigo?:    string;
  funcionalidadId?: number;
};

async function evaluarPermiso(
  aplicacionId: number,
  usuarioId:    number,
  rolIds:       number[],
  now:          Date,
  item:         PermisoInput
): Promise<PermisoResultado> {
  const objetoKey  = String(item.ObjetoKey).trim();
  const accionKey  = item.AccionKey    ? String(item.AccionKey).trim().toLowerCase() : undefined;
  const accionCod  = item.AccionCodigo ? String(item.AccionCodigo).trim()            : undefined;
  const objetoPath = item.ObjetoPath   ? String(item.ObjetoPath).trim()              : undefined;

  type Base = Omit<PermisoResultado, "permitido" | "razon">;
  const base: Base = { objetoKey, accionKey, accionCodigo: accionCod };

  const ok   = (razon: string, extra: Partial<Base> = {}): PermisoResultado =>
    ({ ...base, ...extra, permitido: "GRANTED", razon });
  const deny = (razon: string, extra: Partial<Base> = {}): PermisoResultado =>
    ({ ...base, ...extra, permitido: "DENIED",  razon });

  // Objeto
  const objeto = await prisma.objeto.findFirst({
    where: {
      aplicacionId,
      key:    objetoKey,
      estado: "A",
      ...(item.ObjetoTipo ? { tipo: String(item.ObjetoTipo).trim().toUpperCase() } : {}),
    },
    select: { id: true, esPublico: true },
  });

  if (!objeto)                  return deny("OBJETO_NOT_FOUND");
  if (objeto.esPublico === "S") return ok("PUBLIC_OBJECT");

  // ObjetoAccion
  const accionFilter: Record<string, unknown>[] = [];
  if (accionKey)  accionFilter.push({ key:    { equals: accionKey, mode: "insensitive" } });
  if (accionCod)  accionFilter.push({ codigo: { equals: accionCod } });
  if (objetoPath) accionFilter.push({ path:   { equals: objetoPath } });

  const oa = await prisma.objetoAccion.findFirst({
    where: {
      objetoId: objeto.id,
      ...(accionFilter.length > 0 ? { OR: accionFilter } : {}),
    },
    select: { id: true, key: true, codigo: true },
  });

  if (accionFilter.length > 0 && !oa) return deny("OBJETO_ACCION_NOT_FOUND");

  const resolved: Base = {
    objetoKey,
    accionKey:    oa?.key    ?? accionKey,
    accionCodigo: oa?.codigo ?? accionCod,
  };
  const ok2   = (razon: string, extra: Partial<Base> = {}): PermisoResultado =>
    ({ ...resolved, ...extra, permitido: "GRANTED", razon });
  const deny2 = (razon: string): PermisoResultado =>
    ({ ...resolved, permitido: "DENIED", razon });

  // FuncionalidadObjetoAccion -> Funcionalidades
  const funcLinks = await prisma.funcionalidadObjetoAccion.findMany({
    where: {
      objetoId: objeto.id,
      ...(oa ? { objetoAccionId: oa.id } : {}),
      funcionalidad: {
        aplicacionId,
        estado: "A",
        OR:  [{ fechaDesde: null }, { fechaDesde: { lte: now } }] as object[],
        AND: [{ OR: [{ fechaHasta: null }, { fechaHasta: { gte: now } }] }] as object[],
      },
    },
    select: {
      funcionalidadId: true,
      funcionalidad:   { select: { esPublico: true, soloRoot: true } },
    },
  });

  if (funcLinks.length === 0)                                   return deny2("NO_FUNCIONALIDAD_DEFINED");
  if (funcLinks.some((f) => f.funcionalidad.esPublico === "S")) return ok2("PUBLIC_FUNCIONALIDAD");
  if (funcLinks.every((f) => f.funcionalidad.soloRoot === "S")) return deny2("SOLO_ROOT");

  const funcIds = funcLinks
    .filter((f) => f.funcionalidad.soloRoot !== "S")
    .map((f) => f.funcionalidadId);

  // Acceso directo
  const accesoDirecto = await prisma.acceso.findFirst({
    where: {
      usuarioId,
      funcionalidadId: { in: funcIds },
      efecto:          "ALLOW",
      OR:  [{ fechaDesde: null }, { fechaDesde: { lte: now } }] as object[],
      AND: [{ OR: [{ fechaHasta: null }, { fechaHasta: { gte: now } }] }] as object[],
    },
    select: { funcionalidadId: true },
  });

  if (accesoDirecto) return ok2("DIRECT_ACCESO", { funcionalidadId: accesoDirecto.funcionalidadId });

  // Acceso via rol
  if (rolIds.length > 0) {
    const rolFunc = await prisma.rolFuncionalidad.findFirst({
      where: { rolId: { in: rolIds }, funcionalidadId: { in: funcIds } },
      select: { funcionalidadId: true },
    });
    if (rolFunc) return ok2("ROL_FUNCIONALIDAD", { funcionalidadId: rolFunc.funcionalidadId });
  }

  return deny2("ACCESS_DENIED");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { aplicacion, permisos: permisosArray, ...singleItem } = body as {
      aplicacion?: string;
      permisos?:   PermisoInput[];
    } & PermisoInput;

    if (!aplicacion) {
      return NextResponse.json({ error: "MISSING_PARAMS", detail: "aplicacion es requerido" }, { status: 400 });
    }

    // Auth
    const token = extractToken(request);
    const errAuth = (razon: string, status: number) => {
      const d: PermisoResultado = { permitido: "DENIED", razon, objetoKey: "" };
      return NextResponse.json(permisosArray ? { resultados: permisosArray.map(() => d) } : d, { status });
    };

    if (!token) return errAuth("NO_TOKEN", 401);

    const payload = decodeJwt(token);
    if (!payload) return errAuth("INVALID_TOKEN", 401);

    const rawUsername = (
      payload.username ?? payload.sub ?? payload.name ??
      payload.email   ?? payload.preferred_username ?? null
    ) as string | null;

    if (!rawUsername) return errAuth("NO_USERNAME_IN_TOKEN", 401);

    const usuario = await prisma.usuario.findFirst({
      where: {
        OR: [
          { username: { equals: String(rawUsername).trim(), mode: "insensitive" } },
          { email:    { equals: String(rawUsername).trim(), mode: "insensitive" } },
        ],
        estado: "A",
      },
      select: { id: true, esRoot: true },
    });

    if (!usuario) return errAuth("USER_NOT_FOUND", 403);

    // Root -> GRANTED en todo
    if (usuario.esRoot === "S") {
      const rootResult = (i: PermisoInput): PermisoResultado => ({
        permitido:    "GRANTED",
        razon:        "ROOT",
        objetoKey:    String(i.ObjetoKey ?? "").trim(),
        accionKey:    i.AccionKey    ? String(i.AccionKey).trim().toLowerCase() : undefined,
        accionCodigo: i.AccionCodigo ? String(i.AccionCodigo).trim()            : undefined,
      });
      return NextResponse.json(
        permisosArray ? { resultados: permisosArray.map(rootResult) } : rootResult(singleItem)
      );
    }

    // Aplicacion
    const app = await prisma.aplicacion.findFirst({
      where: { nombre: { equals: String(aplicacion).trim(), mode: "insensitive" }, estado: "A" },
      select: { id: true },
    });

    if (!app) {
      const d: PermisoResultado = { permitido: "DENIED", razon: "APP_NOT_FOUND", objetoKey: "" };
      return NextResponse.json(permisosArray ? { resultados: permisosArray.map(() => d) } : d);
    }

    // Roles activos (calculado una vez, reutilizado en batch)
    const now = new Date();
    const rolesActivos = await prisma.usuarioRol.findMany({
      where: {
        usuarioId: usuario.id,
        OR:  [{ fechaDesde: null }, { fechaDesde: { lte: now } }] as object[],
        AND: [{ OR: [{ fechaHasta: null }, { fechaHasta: { gte: now } }] }] as object[],
        rol: { estado: "A" },
      },
      select: { rolId: true },
    });
    const rolIds = rolesActivos.map((r) => r.rolId);

    // Batch
    if (permisosArray) {
      if (!Array.isArray(permisosArray) || permisosArray.length === 0) {
        return NextResponse.json({ error: "permisos debe ser un array no vacio" }, { status: 400 });
      }
      const resultados = await Promise.all(
        permisosArray.map((item) => evaluarPermiso(app.id, usuario.id, rolIds, now, item))
      );
      return NextResponse.json({ resultados });
    }

    // Single
    if (!singleItem.ObjetoKey) {
      return NextResponse.json(
        { permitido: "DENIED", razon: "MISSING_PARAMS", objetoKey: "", detail: "ObjetoKey es requerido" },
        { status: 400 }
      );
    }

    const resultado = await evaluarPermiso(app.id, usuario.id, rolIds, now, singleItem);
    return NextResponse.json(resultado);

  } catch (error) {
    console.error("[API/db/permisos POST]", error);
    return NextResponse.json({ permitido: "DENIED", razon: "SERVER_ERROR", objetoKey: "" }, { status: 500 });
  }
}
