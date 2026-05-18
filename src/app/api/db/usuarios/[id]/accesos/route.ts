import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

type EfectoDirecto = "grant" | "deny";

interface AccesoDirecto {
  efecto: EfectoDirecto;
  fechaDesde: string | null;
  fechaHasta: string | null;
}

interface FuncionalidadConEstado {
  funcionalidadId: number;
  funcionalidadNombre: string;
  aplicacionId: number;
  aplicacionNombre: string;
  viaRoles: string[];
  accesoDirecto: AccesoDirecto | null;
}

interface CambioAcceso {
  funcionalidadId: number;
  efecto?: EfectoDirecto;
  fechaDesde?: string | null;
  fechaHasta?: string | null;
  remove?: boolean;
}

// ─── GET /api/db/usuarios/[id]/accesos ───────────────────────────────────────
// Devuelve todas las funcionalidades del sistema con:
//   - accesoDirecto: override en tabla `accesos` (grant/deny) o null
//   - viaRoles: nombres de roles del usuario que la otorgan

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const usuarioId = parseInt(id);
    if (isNaN(usuarioId)) {
      return NextResponse.json(
        { success: false, error: "ID de usuario inválido" },
        { status: 400 }
      );
    }

    // 1. Todas las funcionalidades activas con su aplicación
    const funcionalidades = await prisma.funcionalidad.findMany({
      where: { estado: "A" },
      include: {
        aplicacion: { select: { id: true, nombre: true } },
      },
      orderBy: [{ aplicacionId: "asc" }, { nombre: "asc" }],
    });

    // 2. Accesos directos del usuario (tabla accesos)
    const accesosDirectos = await prisma.acceso.findMany({
      where: { usuarioId },
      select: {
        funcionalidadId: true,
        efecto: true,
        fechaDesde: true,
        fechaHasta: true,
      },
    });
    const accesoDirectoMap = new Map(
      accesosDirectos.map((a) => [a.funcionalidadId, a])
    );

    // 3. Roles del usuario con sus funcionalidades
    const usuarioRoles = await prisma.usuarioRol.findMany({
      where: { usuarioId },
      include: {
        rol: {
          select: {
            nombre: true,
            funcionalidades: { select: { funcionalidadId: true } },
          },
        },
      },
    });

    // Mapa: funcionalidadId → nombres de roles que la otorgan
    const funcViaRolesMap = new Map<number, string[]>();
    for (const ur of usuarioRoles) {
      const rolNombre = ur.rol.nombre;
      for (const rf of ur.rol.funcionalidades) {
        const lista = funcViaRolesMap.get(rf.funcionalidadId) ?? [];
        lista.push(rolNombre);
        funcViaRolesMap.set(rf.funcionalidadId, lista);
      }
    }

    // 4. Combinar
    const items: FuncionalidadConEstado[] = funcionalidades.map((f) => {
      const directo = accesoDirectoMap.get(f.id) ?? null;
      return {
        funcionalidadId: f.id,
        funcionalidadNombre: f.nombre,
        aplicacionId: f.aplicacion.id,
        aplicacionNombre: f.aplicacion.nombre,
        viaRoles: funcViaRolesMap.get(f.id) ?? [],
        accesoDirecto: directo
          ? {
              efecto: directo.efecto as EfectoDirecto,
              fechaDesde: directo.fechaDesde
                ? directo.fechaDesde.toISOString()
                : null,
              fechaHasta: directo.fechaHasta
                ? directo.fechaHasta.toISOString()
                : null,
            }
          : null,
      };
    });

    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error("[API/db/usuarios/[id]/accesos GET]", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener funcionalidades del usuario" },
      { status: 500 }
    );
  }
}

// ─── PUT /api/db/usuarios/[id]/accesos ───────────────────────────────────────
// Bulk upsert/delete de accesos directos.
// Body: { cambios: CambioAcceso[] }

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const usuarioId = parseInt(id);
    if (isNaN(usuarioId)) {
      return NextResponse.json(
        { success: false, error: "ID de usuario inválido" },
        { status: 400 }
      );
    }

    // Validar que el usuario existe
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true },
    });
    if (!usuario) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { cambios } = body as { cambios: CambioAcceso[] };

    if (!Array.isArray(cambios) || cambios.length === 0) {
      return NextResponse.json(
        { success: false, error: "Se requiere un array 'cambios' no vacío" },
        { status: 400 }
      );
    }

    // Validar funcionalidades referenciadas
    const funcIds = [...new Set(cambios.map((c) => c.funcionalidadId))];
    const funcsExistentes = await prisma.funcionalidad.findMany({
      where: { id: { in: funcIds } },
      select: { id: true },
    });
    const funcsExistentesSet = new Set(funcsExistentes.map((f) => f.id));
    const funcsInvalidas = funcIds.filter((fid) => !funcsExistentesSet.has(fid));
    if (funcsInvalidas.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Funcionalidades no encontradas: ${funcsInvalidas.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validar efectos
    const efectosValidos: EfectoDirecto[] = ["grant", "deny"];
    for (const c of cambios) {
      if (!c.remove && c.efecto && !efectosValidos.includes(c.efecto)) {
        return NextResponse.json(
          {
            success: false,
            error: `Efecto inválido '${c.efecto}' para funcionalidadId ${c.funcionalidadId}. Debe ser 'grant' o 'deny'.`,
          },
          { status: 400 }
        );
      }
      if (c.fechaDesde && c.fechaHasta) {
        const desde = new Date(c.fechaDesde);
        const hasta = new Date(c.fechaHasta);
        if (desde > hasta) {
          return NextResponse.json(
            {
              success: false,
              error: `fechaDesde debe ser menor o igual a fechaHasta para funcionalidadId ${c.funcionalidadId}`,
            },
            { status: 400 }
          );
        }
      }
    }

    const now = new Date().toISOString();
    const operaciones: { funcionalidadId: number; operacion: string }[] = [];

    await Promise.all(
      cambios.map(async (cambio) => {
        const { funcionalidadId, efecto, fechaDesde, fechaHasta, remove } = cambio;

        if (remove) {
          // DELETE — si no existe, ignorar silenciosamente
          try {
            await prisma.acceso.delete({
              where: {
                funcionalidadId_usuarioId: { funcionalidadId, usuarioId },
              },
            });
            operaciones.push({ funcionalidadId, operacion: "deleted" });
          } catch {
            // P2025 = record not found — ok, ya no existe
            operaciones.push({ funcionalidadId, operacion: "not_found_ok" });
          }
        } else if (efecto) {
          await prisma.acceso.upsert({
            where: {
              funcionalidadId_usuarioId: { funcionalidadId, usuarioId },
            },
            update: {
              efecto,
              creadoEn: now,
              fechaDesde: fechaDesde ? new Date(fechaDesde) : null,
              fechaHasta: fechaHasta ? new Date(fechaHasta) : null,
            },
            create: {
              funcionalidadId,
              usuarioId,
              efecto,
              creadoEn: now,
              fechaDesde: fechaDesde ? new Date(fechaDesde) : null,
              fechaHasta: fechaHasta ? new Date(fechaHasta) : null,
            },
          });
          operaciones.push({ funcionalidadId, operacion: `upsert:${efecto}` });
        }
      })
    );

    return NextResponse.json({ success: true, operaciones });
  } catch (error) {
    console.error("[API/db/usuarios/[id]/accesos PUT]", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar accesos del usuario" },
      { status: 500 }
    );
  }
}
