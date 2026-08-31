import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAuth } from "@/lib/auth/apiGuard";
import { respuestaSiDejaSinRoot, verificarQueQuedaRoot } from "@/lib/permisos";

// Nivel ROOT en POLITICAS para el PUT y el DELETE, y transacción con
// `verificarQueQuedaRoot` en los dos. El motivo no es obvio: desde que
// `aplicacionesRootDe` descarta los roles de aplicaciones inactivas, poner la
// aplicación SecuritySuite en estado 'I' apaga a TODOS los root de un saque,
// sin tocar un solo rol ni un solo usuario. Es la misma "última puerta" que el
// rol Root, con otra cara. Recuperación si igual pasa: scripts/bootstrap-root.ts.

// GET /api/db/aplicaciones/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Antes esto no chequeaba nada.
  const guard = await requireApiAuth(req);
  if (!guard.ok) return guard.respuesta;

  try {
    const { id } = await params;
    const aplicacion = await prisma.aplicacion.findUnique({
      where: { id: parseInt(id) },
      include: { roles: true, funcionalidades: true },
    });
    if (!aplicacion) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, aplicacion });
  } catch (error) {
    console.error("[API/db/aplicaciones/[id] GET]", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

// PUT /api/db/aplicaciones/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Antes esto no chequeaba nada.
  const guard = await requireApiAuth(request);
  if (!guard.ok) return guard.respuesta;
  const quienLlama = guard.usuario;
  if (!quienLlama) {
    return NextResponse.json({ success: false, error: "Tu sesión no es válida" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { nombre, descripcion, estado, url, tecnologia, sistemaId } = body;
    const confirmarQuitarmeRoot = body?.confirmarQuitarmeRoot === true;

    const data: any = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (descripcion !== undefined) data.descripcion = descripcion;
    if (estado !== undefined) data.estado = estado;
    if (url !== undefined) data.url = url;
    if (tecnologia !== undefined) data.tecnologia = tecnologia;
    if (sistemaId !== undefined) data.sistemaId = sistemaId ? parseInt(sistemaId) : null;

    const aplicacion = await prisma.$transaction(async (tx) => {
      const actualizada = await tx.aplicacion.update({
        where: { id: parseInt(id) },
        data,
      });
      await verificarQueQuedaRoot(tx, quienLlama, confirmarQuitarmeRoot);
      return actualizada;
    });
    return NextResponse.json({ success: true, aplicacion });
  } catch (error) {
    const conflicto = respuestaSiDejaSinRoot(error);
    if (conflicto) return conflicto;
    console.error("[API/db/aplicaciones/[id] PUT]", error);
    return NextResponse.json({ success: false, error: "Error al actualizar" }, { status: 500 });
  }
}

// DELETE /api/db/aplicaciones/[id] — soft delete
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Antes esto no chequeaba nada.
  const guard = await requireApiAuth(req);
  if (!guard.ok) return guard.respuesta;
  const quienLlama = guard.usuario;
  if (!quienLlama) {
    return NextResponse.json({ success: false, error: "Tu sesión no es válida" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const confirmarQuitarmeRoot =
      new URL(req.url).searchParams.get("confirmarQuitarmeRoot") === "true";

    const aplicacion = await prisma.$transaction(async (tx) => {
      const actualizada = await tx.aplicacion.update({
        where: { id: parseInt(id) },
        data: { estado: "I" },
      });
      await verificarQueQuedaRoot(tx, quienLlama, confirmarQuitarmeRoot);
      return actualizada;
    });
    return NextResponse.json({ success: true, aplicacion });
  } catch (error) {
    const conflicto = respuestaSiDejaSinRoot(error);
    if (conflicto) return conflicto;
    console.error("[API/db/aplicaciones/[id] DELETE]", error);
    return NextResponse.json({ success: false, error: "Error al eliminar" }, { status: 500 });
  }
}
