import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAuth } from "@/lib/auth/apiGuard";
import { respuestaSiDejaSinRoot, verificarQueQuedaRoot } from "@/lib/permisos";

// GET /api/db/roles/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Antes esto no chequeaba nada.
  const guard = await requireApiAuth(req);
  if (!guard.ok) return guard.respuesta;

  try {
    const { id } = await params;
    const rol = await prisma.rol.findUnique({
      where: { id: parseInt(id) },
      include: {
        aplicacion: { select: { id: true, nombre: true } },
        funcionalidades: {
          include: { funcionalidad: { select: { id: true, nombre: true, estado: true } } },
        },
      },
    });
    if (!rol) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, rol });
  } catch (error) {
    console.error("[API/db/roles/[id] GET]", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

// PUT /api/db/roles/[id] — actualiza datos + reemplaza funcionalidades
//
// Nivel ROOT en POLITICAS: este PUT puede RENOMBRAR cualquier rol de la
// aplicación 1 a "Root", y como el rol root se identifica por nombre, eso es
// otorgarse root. También puede hacer lo contrario —renombrar el rol Root, o
// pasarlo a estado 'I'— y dejar al sistema sin administrador; por eso lo
// envuelve una transacción con `verificarQueQuedaRoot`.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Nivel ROOT.
  const guard = await requireApiAuth(request);
  if (!guard.ok) return guard.respuesta;
  const quienLlama = guard.usuario;
  if (!quienLlama) {
    return NextResponse.json({ success: false, error: "Tu sesión no es válida" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const rolId = parseInt(id);
    const body = await request.json();
    const { nombre, descripcion, estado, nivel, creadoEn, funcionalidades } = body;
    const confirmarQuitarmeRoot = body?.confirmarQuitarmeRoot === true;

    const data: any = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (descripcion !== undefined) data.descripcion = descripcion;
    if (estado !== undefined) data.estado = estado;
    if (nivel !== undefined) data.nivel = nivel;
    if (creadoEn !== undefined) data.creadoEn = creadoEn;

    // Todo adentro de una transacción: el borrar+crear de funcionalidades y el
    // update del rol eran tres escrituras sueltas, y si la última fallaba el rol
    // quedaba sin ninguna funcionalidad.
    const rol = await prisma.$transaction(async (tx) => {
      // Reemplazar funcionalidades si se envían
      if (funcionalidades !== undefined) {
        await tx.rolFuncionalidad.deleteMany({ where: { rolId } });
        if (funcionalidades.length > 0) {
          await tx.rolFuncionalidad.createMany({
            data: funcionalidades.map((f: any) => ({
              rolId,
              funcionalidadId: parseInt(f.funcionalidadId),
            })),
            skipDuplicates: true,
          });
        }
      }

      const actualizado = await tx.rol.update({ where: { id: rolId }, data });
      await verificarQueQuedaRoot(tx, quienLlama, confirmarQuitarmeRoot);
      return actualizado;
    });

    return NextResponse.json({ success: true, rol });
  } catch (error) {
    const conflicto = respuestaSiDejaSinRoot(error);
    if (conflicto) return conflicto;
    console.error("[API/db/roles/[id] PUT]", error);
    return NextResponse.json({ success: false, error: "Error al actualizar rol" }, { status: 500 });
  }
}

// DELETE /api/db/roles/[id] — soft delete
//
// Nivel ROOT: pasar el rol a estado 'I' se lo saca de hecho a todos los que lo
// tienen (`aplicacionesRootDe` descarta el rol inactivo). Sobre el rol Root de
// secapi, esto deja al sistema sin administrador de un solo request.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Nivel ROOT.
  const guard = await requireApiAuth(req);
  if (!guard.ok) return guard.respuesta;
  const quienLlama = guard.usuario;
  if (!quienLlama) {
    return NextResponse.json({ success: false, error: "Tu sesión no es válida" }, { status: 401 });
  }

  try {
    const { id } = await params;
    // `confirmarQuitarmeRoot` por query string: un DELETE no lleva body en el
    // cliente del panel (`dbFetch` ni siquiera manda Content-Length).
    const confirmarQuitarmeRoot =
      new URL(req.url).searchParams.get("confirmarQuitarmeRoot") === "true";

    const rol = await prisma.$transaction(async (tx) => {
      const actualizado = await tx.rol.update({
        where: { id: parseInt(id) },
        data: { estado: "I" },
      });
      await verificarQueQuedaRoot(tx, quienLlama, confirmarQuitarmeRoot);
      return actualizado;
    });

    return NextResponse.json({ success: true, rol });
  } catch (error) {
    const conflicto = respuestaSiDejaSinRoot(error);
    if (conflicto) return conflicto;
    console.error("[API/db/roles/[id] DELETE]", error);
    return NextResponse.json({ success: false, error: "Error al eliminar rol" }, { status: 500 });
  }
}
