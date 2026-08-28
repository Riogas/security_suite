import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EFECTOS_ALLOW, esRootDeAplicacion, resolveAplicacionId } from "@/lib/permisos";
import { normPath, patternToRegex, specificity } from "@/lib/routePattern";
import { requireApiAuth } from "@/lib/auth/apiGuard";

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
//   2. Aplicacion por nombre / AplicacionId
//   3. rol "Root" vigente de ESA aplicacion (o de secapi, que vale para todas)
//      -> GRANTED en todo sin mas checks
//   4. Objeto activo (key + tipo opcional)  -> PUBLIC_OBJECT si esPublico
//   5. ObjetoAccion (filtra accionKey/Codigo/path)
//   6. funcionalidad_objeto_acciones -> Funcionalidades activas/vigentes
//      -> PUBLIC_FUNCIONALIDAD | SOLO_ROOT
//   7. accesos directo (ALLOW, vigente)
//   8. usuario_roles -> rol_funcionalidades
//   9. ACCESS_DENIED
// =====================================================================

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

// ── Matching de rutas por patrón (:param / *) ───────────────────────────────
type AccionMatch = {
  objetoId: number;
  esPublico: string;
  oa: { id: number; key: string; codigo: string | null };
};

// Busca, entre las ObjetoAcciones de la app con `path` definido, la que matchea
// la ruta concreta por patrón. Devuelve la más específica.
async function matchObjetoPath(
  aplicacionId: number,
  objetoPath: string,
): Promise<AccionMatch | null> {
  const target = normPath(objetoPath);
  const acciones = await prisma.objetoAccion.findMany({
    where: { path: { not: null }, objeto: { aplicacionId, estado: "A" } },
    select: {
      id: true,
      key: true,
      codigo: true,
      path: true,
      objetoId: true,
      objeto: { select: { esPublico: true } },
    },
  });

  const candidatos = acciones.filter((a) => a.path && patternToRegex(a.path).test(target));
  if (candidatos.length === 0) return null;

  candidatos.sort((a, b) => specificity(b.path as string) - specificity(a.path as string));
  const chosen = candidatos[0];
  return {
    objetoId: chosen.objetoId,
    esPublico: chosen.objeto.esPublico,
    oa: { id: chosen.id, key: chosen.key, codigo: chosen.codigo },
  };
}

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

  // Objeto + ObjetoAccion. Estrategia: primero por key (exacto, comportamiento
  // histórico); si falla y hay ObjetoPath, fallback a matching por PATRÓN
  // (:param/*) — esto resuelve rutas dinámicas como /clientes/1, /clientes/5/editar.
  let objetoId: number;
  let objetoEsPublico: string;
  let oa: { id: number; key: string; codigo: string | null } | null = null;

  const objeto = await prisma.objeto.findFirst({
    where: {
      aplicacionId,
      key:    objetoKey,
      estado: "A",
      ...(item.ObjetoTipo ? { tipo: String(item.ObjetoTipo).trim().toUpperCase() } : {}),
    },
    select: { id: true, esPublico: true },
  });

  if (objeto) {
    objetoId = objeto.id;
    objetoEsPublico = objeto.esPublico;

    const accionFilter: Record<string, unknown>[] = [];
    if (accionKey)  accionFilter.push({ key:    { equals: accionKey, mode: "insensitive" } });
    if (accionCod)  accionFilter.push({ codigo: { equals: accionCod } });
    if (objetoPath) accionFilter.push({ path:   { equals: objetoPath } });

    oa = await prisma.objetoAccion.findFirst({
      where: {
        objetoId: objeto.id,
        ...(accionFilter.length > 0 ? { OR: accionFilter } : {}),
      },
      select: { id: true, key: true, codigo: true },
    });

    if (accionFilter.length > 0 && !oa) {
      // No matcheó por key/código/path exacto → probar patrón
      const m = objetoPath ? await matchObjetoPath(aplicacionId, objetoPath) : null;
      if (!m) return deny("OBJETO_ACCION_NOT_FOUND");
      objetoId = m.objetoId;
      objetoEsPublico = m.esPublico;
      oa = m.oa;
    }
  } else {
    // Objeto no encontrado por key → resolver por patrón de ruta
    const m = objetoPath ? await matchObjetoPath(aplicacionId, objetoPath) : null;
    if (!m) return deny("OBJETO_NOT_FOUND");
    objetoId = m.objetoId;
    objetoEsPublico = m.esPublico;
    oa = m.oa;
  }

  if (objetoEsPublico === "S") return ok("PUBLIC_OBJECT");

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
      objetoId: objetoId,
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
      efecto:          { in: EFECTOS_ALLOW },
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
  // Guard de /api/db (src/lib/auth/apiGuard.ts). Antes esta ruta decodificaba
  // el JWT con base64 y sin mirar la firma: cualquiera se hacía pasar por
  // cualquiera en el gate de CADA pantalla de Goya y TrackMovil.
  const guard = await requireApiAuth(request);
  if (!guard.ok) return guard.respuesta;

  try {
    const body = await request.json();
    const { aplicacion, AplicacionId, permisos: permisosArray, ...singleItem } = body as {
      aplicacion?:  string;
      AplicacionId?: number | string;
      permisos?:    PermisoInput[];
    } & PermisoInput;

    if (!aplicacion && AplicacionId == null) {
      return NextResponse.json({ error: "MISSING_PARAMS", detail: "AplicacionId o aplicacion es requerido" }, { status: 400 });
    }

    // Auth: ya la resolvió el guard de arriba — firma HS256 verificada,
    // vencimiento, y el usuario buscado en Postgres por username/email con
    // estado='A'. Lo que acá se hacía a mano (decodeJwt + findFirst) era una
    // copia de `resolveUsuario` sin la parte de verificar.
    const errAuth = (razon: string, status: number) => {
      const d: PermisoResultado = { permitido: "DENIED", razon, objetoKey: "" };
      return NextResponse.json(permisosArray ? { resultados: permisosArray.map(() => d) } : d, { status });
    };

    // En nivel AUTENTICADA el guard nunca deja pasar sin usuario; el chequeo es
    // para el tipo, y de paso para que nadie afloje la política sin darse cuenta.
    const usuario = guard.usuario;
    if (!usuario) return errAuth("USER_NOT_FOUND", 403);

    // Aplicacion — acepta AplicacionId (número) o aplicacion (nombre).
    //
    // Se resuelve ANTES del bypass de root, y ese es el cambio de orden: el
    // bypass mira la aplicacion, asi que hay que saber de qué app se habla para
    // poder decidirlo. Sin aplicacion no hay root de nada: `esRootDeAplicacion`
    // es fail-closed con `aplicacionId` nulo o 0.
    //
    // OJO con lo que este `resolveAplicacionId` NO hace: si la aplicacion
    // pedida no existe (nombre con typo, id de una app dada de baja), NO
    // devuelve null — cae al default del ambiente, que en los tres vale 1, y la
    // pregunta termina contestandose contra SecuritySuite. O sea que
    // `APP_NOT_FOUND` es practicamente inalcanzable. Esta documentado y logueado
    // en `resolveAplicacionId` (src/lib/permisos.ts), y ahi se explica por que
    // no se corta todavia: este es el endpoint mas caliente del ecosistema.
    const appId = await resolveAplicacionId(AplicacionId, aplicacion);

    if (!appId) {
      const d: PermisoResultado = { permitido: "DENIED", razon: "APP_NOT_FOUND", objetoKey: "" };
      return NextResponse.json(permisosArray ? { resultados: permisosArray.map(() => d) } : d);
    }
    const app = { id: appId };

    // Root -> GRANTED en todo, sin mas checks.
    //
    // "Root" acá es el rol "Root" de ESTA aplicacion **o** el rol "Root" de
    // SecuritySuite, que vale para todas. Lo segundo es la decision de alcance
    // del dueño: secapi es donde se configura quien es root de que, asi que su
    // Root es el superusuario del ecosistema — el mismo alcance que tenia
    // `usuarios.es_root='S'`, pero colgado de un rol vigente, con fechas y
    // auditable, en vez de una columna suelta. El razonamiento largo esta en
    // `esRootDeAplicacion` (src/lib/permisos.ts).
    //
    // Lo que si es mas estrecho que antes: el rol tiene que estar VIGENTE, el
    // rol tiene que estar activo y la aplicacion tambien. La columna no miraba
    // nada de eso.
    if (esRootDeAplicacion(usuario, app.id)) {
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
