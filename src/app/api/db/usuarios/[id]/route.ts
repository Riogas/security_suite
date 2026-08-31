import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiAuth } from "@/lib/auth/apiGuard";
import {
  buscarColisionesDeIdentidad,
  mensajeDeColisionDeIdentidad,
  respuestaSiDejaSinRoot,
  verificarQueQuedaRoot,
} from "@/lib/permisos";

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
    const esRootQuienLlama = guard.usuario?.esRootDeSecapi === true;
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
    // `esRoot` dejó de autorizar: root se resuelve por el ROL "Root" de cada
    // aplicación (src/lib/permisos.ts). Este PUT ya no lo escribe NUNCA, ni
    // siquiera para un root.
    //
    // Se rechaza en vez de ignorarlo: guardar la 'S' en silencio dejaría al
    // administrador creyendo que otorgó privilegios que no otorgó, que es la
    // razón por la que el switch "Es root" salió del formulario. El rechazo es
    // solo cuando el valor CAMBIARÍA — un cliente que hace round-trip de la
    // ficha entera y devuelve el mismo valor sigue funcionando.
    if (body.esRoot !== undefined && body.esRoot !== existing.esRoot) {
      return NextResponse.json(
        {
          success: false,
          error:
            "El campo `esRoot` ya no otorga privilegios y no se puede modificar. " +
            "Root se otorga asignando el rol \"Root\" de la aplicación en PUT /api/db/usuarios/:id/roles.",
        },
        { status: 400 },
      );
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

    /*
     * Colisión de identidad. Este PUT no cambia el `username` (no está en
     * `updateData`), pero sí el EMAIL, y con eso alcanza: `resolveUsuario`
     * busca el sujeto del token con `OR: [username ci, email ci]`, así que
     * ponerle a alguien como email el USERNAME de un root hace que el token
     * de ese root matchee dos filas y deje de identificar a una persona.
     *
     * Se chequea solo cuando el email realmente cambia, para no pagar una
     * consulta en cada edición de ficha ni rechazar un round-trip que devuelve
     * el mismo valor. Ver `buscarColisionesDeIdentidad` en src/lib/permisos.ts.
     */
    if (updateData.email !== undefined && updateData.email !== existing.email) {
      const colisiones = await buscarColisionesDeIdentidad(prisma, {
        email: updateData.email,
        excluirUsuarioId: userId,
      });
      if (colisiones.length > 0) {
        return NextResponse.json(
          { success: false, error: mensajeDeColisionDeIdentidad(colisiones) },
          { status: 400 },
        );
      }
    }

    // Transacción + red de contención SOLO si se toca `estado`: dar de baja a
    // un usuario lo saca de `resolveUsuario` (que exige estado='A'), así que
    // desactivar al último root deja al sistema sin administrador. El resto de
    // los campos (nombre, teléfono, clave) no puede quitarle root a nadie, y no
    // tiene sentido pagar una consulta extra en cada edición de ficha.
    const tocaElEstado = updateData.estado !== undefined;
    const confirmarQuitarmeRoot = body?.confirmarQuitarmeRoot === true;

    const usuario = tocaElEstado
      ? await prisma.$transaction(async (tx) => {
          const actualizado = await tx.usuario.update({
            where: { id: userId },
            data: updateData,
          });
          await verificarQueQuedaRoot(tx, guard.usuario!, confirmarQuitarmeRoot);
          return actualizado;
        })
      : await prisma.usuario.update({
          where: { id: userId },
          data: updateData,
        });

    return NextResponse.json({
      success: true,
      usuario: { ...usuario, password: undefined },
    });
  } catch (error: any) {
    const conflicto = respuestaSiDejaSinRoot(error);
    if (conflicto) return conflicto;
    console.error("[API /db/usuarios/[id] PUT] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

// =============================================
// DELETE /api/db/usuarios/[id] - Eliminar (o desactivar) un usuario
//
// Nivel ROOT en POLITICAS. Este handler no chequeaba NADA, y era la forma de
// saltarse el control del PUT de más arriba: el PUT exige ser root para cambiar
// `estado`, pero este DELETE hacía exactamente lo mismo (estado='I') sin
// preguntar. Cualquiera de los 854 usuarios podía dar de baja a los dos roots y
// dejar la instalación sin administrador — `resolveUsuario` solo autentica
// usuarios con estado='A'. No lo reportó ninguno de los dos informes de
// revisión; apareció recorriendo el resto de los handlers.
// =============================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json(
        { success: false, error: "ID inválido" },
        { status: 400 },
      );
    }

    const confirmarQuitarmeRoot =
      new URL(req.url).searchParams.get("confirmarQuitarmeRoot") === "true";

    // Soft delete: cambiar estado a Inactivo y poner fecha de baja
    const usuario = await prisma.$transaction(async (tx) => {
      const actualizado = await tx.usuario.update({
        where: { id: userId },
        data: {
          estado: "I",
          fechaBaja: new Date(),
        },
      });
      await verificarQueQuedaRoot(tx, quienLlama, confirmarQuitarmeRoot);
      return actualizado;
    });

    return NextResponse.json({
      success: true,
      message: "Usuario desactivado correctamente",
      usuario: { id: usuario.id, estado: usuario.estado },
    });
  } catch (error: any) {
    const conflicto = respuestaSiDejaSinRoot(error);
    if (conflicto) return conflicto;
    console.error("[API /db/usuarios/[id] DELETE] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
