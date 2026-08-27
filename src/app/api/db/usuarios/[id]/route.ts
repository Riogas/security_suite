import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiAuth } from "@/lib/auth/apiGuard";

// =============================================
// GET /api/db/usuarios/[id] - Obtener un usuario por ID
// =============================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Antes esto no chequeaba nada.
  const guard = await requireApiAuth(req);
  if (!guard.ok) return guard.respuesta;

  try {
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json(
        { success: false, error: "ID inválido" },
        { status: 400 },
      );
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            rol: {
              include: { aplicacion: true },
            },
          },
        },
        preferencias: true,
      },
    });

    if (!usuario) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      usuario: { ...usuario, password: undefined },
    });
  } catch (error: any) {
    console.error("[API /db/usuarios/[id] GET] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

// =============================================
// PUT /api/db/usuarios/[id] - Actualizar un usuario
// =============================================
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Antes esto no chequeaba nada.
  const guard = await requireApiAuth(req);
  if (!guard.ok) return guard.respuesta;

  try {
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json(
        { success: false, error: "ID inválido" },
        { status: 400 },
      );
    }

    const body = await req.json();

    // Verificar que existe
    const existing = await prisma.usuario.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 },
      );
    }

    // Construir data de actualización (solo campos enviados)
    const updateData: any = {};

    /*
     * Campos que NO son datos del usuario sino controles de seguridad:
     * `password`, `estado`, `esRoot` y `modificaPermisos`. Cerrarle este PUT al
     * anónimo no alcanza — el nivel AUTENTICADA lo alcanza cualquiera de los
     * ~850 usuarios de las cuatro aplicaciones, y `POST /api/db/login` es
     * público, así que conseguir una sesión es el flujo normal del producto.
     *
     * Sin este chequeo, la toma de la cuenta root son dos requests: se le pone
     * clave conocida al root con este PUT (el login local compara la clave EN
     * TEXTO PLANO contra la columna) y después se entra con ella. El bloqueo de
     * `esRoot` de más abajo no servía de nada mientras la clave quedara abierta.
     *
     * Regla: root puede todo; cualquier otro solo puede cambiarse LA CLAVE A SÍ
     * MISMO. Se responde 403 en vez de ignorar el campo: si el panel lo manda
     * sin querer, es mejor enterarse.
     */
    const esRootQuienLlama = guard.usuario?.esRoot === "S";
    const esSuPropioUsuario = guard.usuario?.id === userId;
    const prohibido = (campo: string) =>
      NextResponse.json(
        { success: false, error: `No tenés permiso para cambiar ${campo} de este usuario` },
        { status: 403 },
      );

    if (body.email !== undefined) updateData.email = body.email || null;
    if (body.nombre !== undefined) updateData.nombre = body.nombre || null;
    if (body.apellido !== undefined) updateData.apellido = body.apellido || null;
    if (body.estado !== undefined && body.estado !== existing.estado) {
      // Dar de baja a otro es una acción de administración; además, dejar
      // inactivo al único root deja el sistema sin quien lo administre.
      if (!esRootQuienLlama) return prohibido("el estado");
      updateData.estado = body.estado;
    }
    if (body.telefono !== undefined) updateData.telefono = body.telefono || null;
    if (body.tipoUsuario !== undefined) updateData.tipoUsuario = body.tipoUsuario;
    if (body.esExterno !== undefined) updateData.esExterno = body.esExterno;
    if (body.usuarioExterno !== undefined) updateData.usuarioExterno = body.usuarioExterno || null;
    // `esRoot` es el bypass global del motor de permisos: quien lo tiene entra
    // a todo, en todas las aplicaciones. Que lo pueda tocar cualquiera con
    // sesión válida convierte a este PUT en una escalada de privilegios en un
    // solo request, así que el campo se ignora salvo que el que lo manda ya sea
    // root. Se responde 403 en vez de descartarlo en silencio: si el panel
    // llegara a mandarlo sin querer, es mejor enterarse.
    if (body.esRoot !== undefined && body.esRoot !== existing.esRoot) {
      if (guard.usuario?.esRoot !== "S") {
        return NextResponse.json(
          { success: false, error: "Solo un usuario root puede cambiar el flag root de un usuario" },
          { status: 403 },
        );
      }
      updateData.esRoot = body.esRoot;
    }
    if (body.desdeSistema !== undefined) updateData.desdeSistema = body.desdeSistema;
    if (body.cambioPassword !== undefined) updateData.cambioPassword = body.cambioPassword;
    if (body.observacion !== undefined) updateData.observacion = body.observacion || null;
    if (body.observacion2 !== undefined) updateData.observacion2 = body.observacion2 || null;
    if (body.fechaBaja !== undefined) updateData.fechaBaja = body.fechaBaja ? new Date(body.fechaBaja) : null;

    // Password: solo actualizar si se envía y no es el placeholder.
    // Root le cambia la clave a cualquiera; el resto, solo a sí mismo.
    if (body.password && body.password !== "********") {
      if (!esRootQuienLlama && !esSuPropioUsuario) return prohibido("la clave");
      updateData.password = body.password;
    }
    // `modificaPermisos` habilita a otorgar accesos: es un control, no un dato.
    if (body.modificaPermisos !== undefined) {
      if (body.modificaPermisos !== existing.modificaPermisos && !esRootQuienLlama)
        return prohibido("el permiso de administrar accesos");
      updateData.modificaPermisos = body.modificaPermisos;
    }

    const usuario = await prisma.usuario.update({
      where: { id: userId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      usuario: { ...usuario, password: undefined },
    });
  } catch (error: any) {
    console.error("[API /db/usuarios/[id] PUT] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

// =============================================
// DELETE /api/db/usuarios/[id] - Eliminar (o desactivar) un usuario
// =============================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Guard de /api/db: el nivel de esta ruta se declara en POLITICAS
  // (src/lib/auth/apiGuard.ts). Antes esto no chequeaba nada.
  const guard = await requireApiAuth(req);
  if (!guard.ok) return guard.respuesta;

  try {
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json(
        { success: false, error: "ID inválido" },
        { status: 400 },
      );
    }

    // Soft delete: cambiar estado a Inactivo y poner fecha de baja
    const usuario = await prisma.usuario.update({
      where: { id: userId },
      data: {
        estado: "I",
        fechaBaja: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Usuario desactivado correctamente",
      usuario: { id: usuario.id, estado: usuario.estado },
    });
  } catch (error: any) {
    console.error("[API /db/usuarios/[id] DELETE] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
