import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/db/usuarios/[id]/roles — roles asignados al usuario
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const usuarioId = parseInt(id);

    const usuarioRoles = await prisma.usuarioRol.findMany({
      where: { usuarioId },
      include: {
        rol: {
          include: { aplicacion: { select: { id: true, nombre: true } } },
        },
      },
    });

    return NextResponse.json({ success: true, roles: usuarioRoles });
  } catch (error) {
    console.error("[API/db/usuarios/[id]/roles GET]", error);
    return NextResponse.json({ success: false, error: "Error al obtener roles" }, { status: 500 });
  }
}

// PUT /api/db/usuarios/[id]/roles — reemplaza la asignación completa de roles
// Body: { roles: [{ rolId, fechaDesde?, fechaHasta? }] }
// Además de recrear UsuarioRol, hace UPSERT en accesos para todas las funcionalidades
// de los roles asignados (efecto="grant").
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const usuarioId = parseInt(id);
    const body = await request.json();
    const { roles } = body; // Array de { rolId, fechaDesde?, fechaHasta? }

    // Borrar todos los roles actuales del usuario
    await prisma.usuarioRol.deleteMany({ where: { usuarioId } });

    // Crear los nuevos
    if (roles?.length > 0) {
      await prisma.usuarioRol.createMany({
        data: roles.map((r: any) => ({
          usuarioId,
          rolId: parseInt(r.rolId),
          fechaDesde: r.fechaDesde ? new Date(r.fechaDesde) : null,
          fechaHasta: r.fechaHasta ? new Date(r.fechaHasta) : null,
        })),
        skipDuplicates: true,
      });
    }

    const rolesActualizados = await prisma.usuarioRol.findMany({
      where: { usuarioId },
      include: {
        rol: { include: { aplicacion: { select: { id: true, nombre: true } } } },
      },
    });

    // UPSERT de accesos: para cada funcionalidad de los roles asignados,
    // crear/actualizar un registro en accesos con efecto="grant".
    // Comportamiento aditivo: no se eliminan accesos de roles que se quitaron.
    const warnings: string[] = [];
    try {
      const rolIds = (roles ?? []).map((r: any) => parseInt(r.rolId));
      if (rolIds.length > 0) {
        const rolFuncs = await prisma.rolFuncionalidad.findMany({
          where: { rolId: { in: rolIds } },
          select: { funcionalidadId: true },
        });

        // Deduplicar funcionalidadIds
        const funcIds = [...new Set(rolFuncs.map((rf) => rf.funcionalidadId))];

        if (funcIds.length > 0) {
          const now = new Date().toISOString();
          await Promise.all(
            funcIds.map((funcionalidadId) =>
              prisma.acceso.upsert({
                where: {
                  funcionalidadId_usuarioId: { funcionalidadId, usuarioId },
                },
                update: {
                  efecto: "grant",
                  creadoEn: now,
                  fechaDesde: null,
                  fechaHasta: null,
                },
                create: {
                  funcionalidadId,
                  usuarioId,
                  efecto: "grant",
                  creadoEn: now,
                  fechaDesde: null,
                  fechaHasta: null,
                },
              })
            )
          );
        }
      }
    } catch (accesoError) {
      console.error("[API/db/usuarios/[id]/roles PUT] Error upsert accesos:", accesoError);
      warnings.push("accesos: " + (accesoError instanceof Error ? accesoError.message : String(accesoError)));
    }

    return NextResponse.json({
      success: true,
      roles: rolesActualizados,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (error) {
    console.error("[API/db/usuarios/[id]/roles PUT]", error);
    return NextResponse.json({ success: false, error: "Error al asignar roles" }, { status: 500 });
  }
}
