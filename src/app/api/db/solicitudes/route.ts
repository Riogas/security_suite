import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  resolveUsuario,
  resolveAplicacionId,
  usuarioPuedeAprobar,
} from "@/lib/permisos";

// =====================================================================
// /api/db/solicitudes
//
// POST  -> crear una solicitud de acceso (autoservicio). Auto-crea el
//          Objeto si no existe. Contrato PascalCase (igual al check de
//          permisos / GeneXus). Lo llama el botón de /no-autorizado.
//
// GET   -> listar solicitudes para el panel de aprobación (gated: solo
//          aprobadores). Filtros: ?estado=&search=&page=&pageSize=
// =====================================================================

// ─── POST: crear solicitud ──────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const usuario = await resolveUsuario(request);
    if (!usuario) {
      return NextResponse.json(
        { success: false, error: "NO_AUTORIZADO" },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const objetoKey = String(body.ObjetoKey ?? body.objetoKey ?? "").trim();
    const objetoTipo = String(body.ObjetoTipo ?? body.objetoTipo ?? "PAGE")
      .trim()
      .toUpperCase();
    const accionKey = String(body.AccionKey ?? body.accionKey ?? "view")
      .trim()
      .toLowerCase();
    const accionCodigo = body.AccionCodigo ?? body.accionCodigo ?? null;
    const objetoPath = body.ObjetoPath ?? body.objetoPath ?? body.ruta ?? null;
    const motivo = body.Motivo ?? body.motivo ?? null;

    if (!objetoKey) {
      return NextResponse.json(
        { success: false, error: "ObjetoKey es requerido" },
        { status: 400 },
      );
    }

    const aplicacionId = await resolveAplicacionId(
      body.AplicacionId ?? body.aplicacionId,
      body.aplicacion ?? body.Aplicacion,
    );
    if (!aplicacionId) {
      return NextResponse.json(
        { success: false, error: "APP_NOT_FOUND" },
        { status: 400 },
      );
    }

    // 1. Resolver o auto-crear el Objeto
    let objeto = await prisma.objeto.findFirst({
      where: { aplicacionId, key: objetoKey, tipo: objetoTipo },
      select: { id: true },
    });
    let objetoCreado = false;
    if (!objeto) {
      objeto = await prisma.objeto.create({
        data: {
          aplicacionId,
          tipo: objetoTipo,
          key: objetoKey,
          label: objetoKey,
          path: objetoPath ? String(objetoPath).slice(0, 255) : null,
          estado: "A",
          esPublico: "N",
          orden: 0,
          creadoEn: usuario.username,
        },
        select: { id: true },
      });
      objetoCreado = true;
    }

    // 2. ObjetoAccion (opcional)
    const accionFilter: Record<string, unknown>[] = [
      { key: { equals: accionKey, mode: "insensitive" } },
    ];
    if (accionCodigo) accionFilter.push({ codigo: { equals: String(accionCodigo) } });
    const objetoAccion = await prisma.objetoAccion.findFirst({
      where: { objetoId: objeto.id, OR: accionFilter },
      select: { id: true },
    });

    // 3. Dedupe: reusar solicitud PENDIENTE existente
    const existente = await prisma.solicitudPermiso.findFirst({
      where: {
        usuarioId: usuario.id,
        objetoId: objeto.id,
        accionKey,
        estado: "PENDIENTE",
      },
    });
    if (existente) {
      return NextResponse.json({
        success: true,
        solicitud: existente,
        objetoCreado,
        reused: true,
      });
    }

    // 4. Crear solicitud
    const solicitud = await prisma.solicitudPermiso.create({
      data: {
        usuarioId: usuario.id,
        aplicacionId,
        objetoId: objeto.id,
        objetoAccionId: objetoAccion?.id ?? null,
        accionKey,
        estado: "PENDIENTE",
        motivoSolicitud: motivo ? String(motivo).slice(0, 1000) : null,
        rutaSolicitada: objetoPath ? String(objetoPath).slice(0, 255) : null,
        accionCodigo: accionCodigo ? String(accionCodigo).slice(0, 20) : null,
      },
    });

    return NextResponse.json(
      { success: true, solicitud, objetoCreado, reused: false },
      { status: 201 },
    );
  } catch (error) {
    console.error("[API/db/solicitudes POST]", error);
    return NextResponse.json(
      { success: false, error: "Error al crear la solicitud" },
      { status: 500 },
    );
  }
}

// ─── GET: listar (panel, gated) ──────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const usuario = await resolveUsuario(request);
    if (!usuario) {
      return NextResponse.json(
        { success: false, error: "NO_AUTORIZADO" },
        { status: 401 },
      );
    }
    if (!(await usuarioPuedeAprobar(usuario))) {
      return NextResponse.json(
        { success: false, error: "SIN_PERMISO_APROBAR" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get("estado") || "";
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "20")),
    );
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (estado && estado !== "todos") where.estado = estado;
    if (search) {
      where.OR = [
        { objeto: { key: { contains: search, mode: "insensitive" } } },
        { objeto: { label: { contains: search, mode: "insensitive" } } },
        { usuario: { username: { contains: search, mode: "insensitive" } } },
        { usuario: { nombre: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.solicitudPermiso.findMany({
        where,
        orderBy: [{ estado: "asc" }, { fechaCreacion: "desc" }],
        skip,
        take: pageSize,
        include: {
          usuario: { select: { id: true, username: true, nombre: true, apellido: true, email: true } },
          aplicacion: { select: { id: true, nombre: true } },
          objeto: { select: { id: true, key: true, label: true, tipo: true, path: true } },
          funcionalidad: { select: { id: true, nombre: true } },
        },
      }),
      prisma.solicitudPermiso.count({ where }),
    ]);

    // Para cada solicitud: funcionalidades candidatas (vinculadas al objeto+acción)
    const objetoIds = [...new Set(rows.map((r) => r.objetoId))];
    const links = objetoIds.length
      ? await prisma.funcionalidadObjetoAccion.findMany({
          where: { objetoId: { in: objetoIds }, funcionalidad: { estado: "A" } },
          select: {
            objetoId: true,
            objetoAccionId: true,
            funcionalidad: { select: { id: true, nombre: true } },
          },
        })
      : [];

    const items = rows.map((r) => {
      const candidatas = links
        .filter(
          (l) =>
            l.objetoId === r.objetoId &&
            (r.objetoAccionId == null || l.objetoAccionId == null || l.objetoAccionId === r.objetoAccionId),
        )
        .map((l) => l.funcionalidad);
      // dedupe por id
      const candidatasUnicas = Array.from(
        new Map(candidatas.map((f) => [f.id, f])).values(),
      );
      return {
        ...r,
        funcionalidadesCandidatas: candidatasUnicas,
        requiereVinculo: candidatasUnicas.length === 0,
      };
    });

    return NextResponse.json({
      success: true,
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("[API/db/solicitudes GET]", error);
    return NextResponse.json(
      { success: false, error: "Error al listar solicitudes" },
      { status: 500 },
    );
  }
}
