import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveUsuario } from "@/lib/permisos";
import { requireApiAuth } from "@/lib/auth/apiGuard";

// GET /api/db/solicitudes/mias
// Devuelve las solicitudes del usuario autenticado (para ver su estado).
export async function GET(request: NextRequest) {
  // Guard de /api/db (src/lib/auth/apiGuard.ts). La ruta ya exigía token, pero
  // sin verificar la firma; el guard lo verifica antes de llegar acá.
  const guard = await requireApiAuth(request);
  if (!guard.ok) return guard.respuesta;

  try {
    const usuario = await resolveUsuario(request);
    if (!usuario) {
      return NextResponse.json(
        { success: false, error: "NO_AUTORIZADO" },
        { status: 401 },
      );
    }

    const items = await prisma.solicitudPermiso.findMany({
      where: { usuarioId: usuario.id },
      orderBy: { fechaCreacion: "desc" },
      include: {
        objeto: { select: { key: true, label: true, tipo: true, path: true } },
        aplicacion: { select: { nombre: true } },
        funcionalidad: { select: { nombre: true } },
      },
    });

    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error("[API/db/solicitudes/mias GET]", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener tus solicitudes" },
      { status: 500 },
    );
  }
}
