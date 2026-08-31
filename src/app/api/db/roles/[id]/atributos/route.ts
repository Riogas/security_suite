import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAuth } from "@/lib/auth/apiGuard";

// GET /api/db/roles/[id]/atributos — atributos del rol
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Antes esto no chequeaba nada.
  const guard = await requireApiAuth(req);
  if (!guard.ok) return guard.respuesta;

  try {
    const { id } = await params;
    const rolId = parseInt(id);

    const atributos = await prisma.rolPreferencia.findMany({
      where: { rolId },
      orderBy: { atributo: "asc" },
    });

    return NextResponse.json({ success: true, atributos });
  } catch (error) {
    console.error("[API/db/roles/[id]/atributos GET]", error);
    return NextResponse.json({ success: false, error: "Error al obtener atributos" }, { status: 500 });
  }
}

// PUT /api/db/roles/[id]/atributos — reemplaza todos los atributos del rol
// Body: { atributos: [{ atributo, valor }] }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Antes esto no chequeaba nada.
  const guard = await requireApiAuth(request);
  if (!guard.ok) return guard.respuesta;

  try {
    const { id } = await params;
    const rolId = parseInt(id);
    const body = await request.json();
    const { atributos } = body; // Array de { atributo, valor }

    /*
     * Alcance de la api-key de servicio.
     *
     * La key se le entrega al edge de Granel para UNA cosa: mantener el atributo
     * `GranelTiposDoc` de los roles de la aplicación Granel. Sin este cerco, esa
     * misma key reescribe los atributos de CUALQUIER rol de CUALQUIER aplicación
     * — y estos atributos no son decorativos: un rol sin el atributo `Escenario`
     * es GLOBAL (ver src/lib/auth/applyScenarioFilter.ts). O sea que un PUT que
     * "limpia" atributos AMPLÍA el alcance del rol en vez de recortarlo.
     *
     * Una sesión de usuario normal no pasa por acá: sigue pudiendo administrar
     * todos los atributos desde el panel, que para eso está.
     */
    if (guard.viaServicio) {
      const APP_SERVICIO = Number(process.env.SERVICE_KEY_APLICACION_ID ?? 6);
      const ATRIBUTO_SERVICIO = process.env.SERVICE_KEY_ATRIBUTO ?? "GranelTiposDoc";

      const rol = await prisma.rol.findUnique({
        where: { id: rolId },
        select: { aplicacionId: true },
      });
      if (!rol || rol.aplicacionId !== APP_SERVICIO) {
        return NextResponse.json(
          { success: false, error: "SERVICIO_FUERA_DE_ALCANCE: ese rol no es de la aplicación habilitada" },
          { status: 403 },
        );
      }
      // La clave de servicio SOLO puede tocar `GranelTiposDoc`. Los demás
      // atributos del body se IGNORAN, no se rechazan: así el edge de Granel
      // puede seguir mandando el juego completo (GranelTiposDoc + los que ya
      // tenía el rol) como hace hoy para preservarlos contra el secapi viejo, y
      // acá simplemente no los tocamos. Rechazar rompía ese cliente y obligaba a
      // desplegar los dos repos en un orden exacto; ignorar los desacopla.
      //
      // El límite de seguridad se mantiene: el borrado y el alta se acotan a
      // `GranelTiposDoc`, así que la clave NO puede borrar ni escribir Escenario
      // (ni ningún otro atributo), que era el punto.
      const propios = (atributos ?? []).filter(
        (a: { atributo: string }) => a.atributo === ATRIBUTO_SERVICIO,
      );
      await prisma.rolPreferencia.deleteMany({ where: { rolId, atributo: ATRIBUTO_SERVICIO } });
      if (propios.length > 0) {
        await prisma.rolPreferencia.createMany({
          data: propios.map((a: { atributo: string; valor?: string | null }) => ({
            rolId,
            atributo: a.atributo,
            valor: a.valor ?? null,
          })),
        });
      }
      const todos = await prisma.rolPreferencia.findMany({
        where: { rolId },
        orderBy: { atributo: "asc" },
      });
      return NextResponse.json({ success: true, atributos: todos });
    }

    // Borrar todos los atributos actuales
    await prisma.rolPreferencia.deleteMany({ where: { rolId } });

    // Crear los nuevos
    if (atributos?.length > 0) {
      await prisma.rolPreferencia.createMany({
        data: atributos.map((a: { atributo: string; valor?: string | null }) => ({
          rolId,
          atributo: a.atributo,
          valor: a.valor ?? null,
        })),
      });
    }

    const atributosActualizados = await prisma.rolPreferencia.findMany({
      where: { rolId },
      orderBy: { atributo: "asc" },
    });

    return NextResponse.json({ success: true, atributos: atributosActualizados });
  } catch (error) {
    console.error("[API/db/roles/[id]/atributos PUT]", error);
    return NextResponse.json({ success: false, error: "Error al guardar atributos" }, { status: 500 });
  }
}

// POST /api/db/roles/[id]/atributos — agregar o actualizar un único atributo
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Antes esto no chequeaba nada.
  const guard = await requireApiAuth(request);
  if (!guard.ok) return guard.respuesta;

  try {
    const { id } = await params;
    const rolId = parseInt(id);
    const body = await request.json();
    const { atributo, valor } = body;

    if (!atributo) {
      return NextResponse.json({ success: false, error: "atributo es requerido" }, { status: 400 });
    }

    // Upsert: si ya existe el atributo, actualizar; si no, crear
    const existing = await prisma.rolPreferencia.findFirst({
      where: { rolId, atributo },
    });

    let result;
    if (existing) {
      result = await prisma.rolPreferencia.update({
        where: { id: existing.id },
        data: { valor: valor ?? null },
      });
    } else {
      result = await prisma.rolPreferencia.create({
        data: { rolId, atributo, valor: valor ?? null },
      });
    }

    return NextResponse.json({ success: true, atributo: result });
  } catch (error) {
    console.error("[API/db/roles/[id]/atributos POST]", error);
    return NextResponse.json({ success: false, error: "Error al guardar atributo" }, { status: 500 });
  }
}
