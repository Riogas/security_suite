import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAuth } from "@/lib/auth/apiGuard";
import { respuestaSiDejaSinRoot, verificarQueQuedaRoot } from "@/lib/permisos";

// GET /api/db/usuarios/[id]/roles — roles asignados al usuario
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Antes esto no chequeaba nada.
  const guard = await requireApiAuth(req);
  if (!guard.ok) return guard.respuesta;

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

// =====================================================================
// PUT /api/db/usuarios/[id]/roles — reemplaza la asignación completa de roles
//
// Body: { roles: [{ rolId, fechaDesde?, fechaHasta? }], confirmarQuitarmeRoot? }
//
// Este endpoint es LA puerta del privilegio desde que root dejó de ser
// `usuarios.es_root` y pasó a ser el rol "Root" (ver el bloque "Root por ROL"
// en src/lib/permisos.ts): asignar el rol Root de secapi es hacerse root de
// todo el ecosistema, y quitarlo es dejar a alguien afuera. Por eso acá pasan
// tres cosas que antes no pasaban:
//
//   1. Nivel ROOT en POLITICAS. Estaba en AUTENTICADA y el handler no miraba
//      NADA más allá de tener sesión: ni quién llamaba, ni que el `:id` fuera
//      el propio, ni qué roles se estaban asignando. Un solo request y
//      cualquiera de los 854 usuarios quedaba root de todo.
//   2. deleteMany + createMany adentro de UNA transacción. Estaban sueltos: si
//      el create fallaba (un `rolId` que no existe, un timeout), el usuario
//      quedaba con CERO roles — y ahora "cero roles" significa "sin root", que
//      antes era imposible porque el flag vivía en otra tabla y sobrevivía a
//      cualquier edición de roles.
//   3. Dos redes de contención sobre el resultado, verificadas DENTRO de la
//      transacción (`verificarQueQuedaRoot`): que no quede el sistema sin
//      ningún root, y que el que llama no se saque su propio Root sin decir
//      explícitamente que quiere hacerlo.
//
// Además de recrear UsuarioRol, hace UPSERT en accesos para todas las
// funcionalidades de los roles asignados (efecto="grant").
// =====================================================================
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Nivel ROOT.
  const guard = await requireApiAuth(request);
  if (!guard.ok) return guard.respuesta;

  // En nivel ROOT el guard nunca deja pasar sin usuario; el chequeo es para el
  // tipo, y de paso para que nadie afloje la política sin darse cuenta.
  const quienLlama = guard.usuario;
  if (!quienLlama) {
    return NextResponse.json(
      { success: false, error: "Tu sesión no es válida, volvé a iniciar sesión" },
      { status: 401 },
    );
  }

  try {
    const { id } = await params;
    const usuarioId = parseInt(id);
    if (isNaN(usuarioId)) {
      return NextResponse.json({ success: false, error: "ID de usuario inválido" }, { status: 400 });
    }

    const body = await request.json();
    const { roles } = body; // Array de { rolId, fechaDesde?, fechaHasta? }
    const confirmarQuitarmeRoot = body?.confirmarQuitarmeRoot === true;

    // Normalización y validación del payload ANTES de tocar nada. Un `rolId`
    // que no existe tiene que ser un 400 y no una transacción que revienta
    // después del deleteMany.
    const pedidos: { rolId: number; fechaDesde: Date | null; fechaHasta: Date | null }[] = (
      Array.isArray(roles) ? roles : []
    ).map((r: { rolId: number | string; fechaDesde?: string; fechaHasta?: string }) => ({
      rolId: parseInt(String(r?.rolId)),
      fechaDesde: r?.fechaDesde ? new Date(r.fechaDesde) : null,
      fechaHasta: r?.fechaHasta ? new Date(r.fechaHasta) : null,
    }));

    if (pedidos.some((r) => isNaN(r.rolId))) {
      return NextResponse.json(
        { success: false, error: "Hay un rolId inválido en el payload" },
        { status: 400 },
      );
    }

    const idsPedidos = [...new Set(pedidos.map((r) => r.rolId))];
    if (idsPedidos.length > 0) {
      const existentes = await prisma.rol.findMany({
        where: { id: { in: idsPedidos } },
        select: { id: true },
      });
      const faltan = idsPedidos.filter((rid) => !existentes.some((e) => e.id === rid));
      if (faltan.length > 0) {
        return NextResponse.json(
          { success: false, error: `Roles no encontrados: ${faltan.join(", ")}` },
          { status: 400 },
        );
      }
    }

    // ── La escritura, atómica ────────────────────────────────────────────────
    //
    // El upsert de accesos NO entra en la transacción a propósito: es aditivo e
    // idempotente, ya venía con su propio try/catch devolviendo `warnings`, y
    // que falle no puede DESHACER una asignación de roles que sí quedó bien.
    // Lo que tiene que ser atómico es el borrar+crear, que es lo que puede
    // dejar a un usuario sin roles a mitad de camino.
    await prisma.$transaction(async (tx) => {
      await tx.usuarioRol.deleteMany({ where: { usuarioId } });

      if (pedidos.length > 0) {
        await tx.usuarioRol.createMany({
          data: pedidos.map((r) => ({
            usuarioId,
            rolId: r.rolId,
            fechaDesde: r.fechaDesde,
            fechaHasta: r.fechaHasta,
          })),
          skipDuplicates: true,
        });
      }

      // Se verifica el estado FINAL ya escrito, y no una predicción sobre el
      // payload: predecir obligaría a reimplementar acá el criterio de vigencia
      // y el de "el rol se llama Root", y dos implementaciones del mismo
      // criterio es exactamente como se abren los agujeros. Si esto tira, la
      // transacción se deshace entera y el usuario queda como estaba.
      await verificarQueQuedaRoot(tx, quienLlama, confirmarQuitarmeRoot);
    });

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
      const rolIds = pedidos.map((r) => r.rolId);
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
    const conflicto = respuestaSiDejaSinRoot(error);
    if (conflicto) return conflicto;
    console.error("[API/db/usuarios/[id]/roles PUT]", error);
    return NextResponse.json({ success: false, error: "Error al asignar roles" }, { status: 500 });
  }
}
