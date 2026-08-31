import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAuth } from "@/lib/auth/apiGuard";
import {
  funcionalidadConfierePrivilegio,
  EFECTO_GRANT,
} from "@/lib/permisos";

// =====================================================================
// POST /api/db/solicitudes/[id]/aprobar
// Body: { funcionalidadId?, fechaDesde?, fechaHasta?, comentario? }
//
// ── El agujero que esto cierra ──────────────────────────────────────────────
//
// Este endpoint escribe en `accesos` —concesiones DIRECTAS de funcionalidad—
// y hasta acá tomaba el `funcionalidadId` del BODY, sin mirar qué había pedido
// la solicitud. Con eso, un aprobador que NO es root se creaba una solicitud a
// sí mismo por cualquier pantalla y la aprobaba nombrando la funcionalidad que
// se le antojara: se otorgaba la de /docs, o la de aprobar solicitudes, y desde
// ahí fabricaba más aprobadores en cadena.
//
// Las otras dos puertas a `accesos` (`PUT /usuarios/:id/accesos` y
// `POST|DELETE /accesos`) subieron a nivel ROOT. Esta NO puede subir: el flujo
// de aprobación existe justamente para que un aprobador que no es root apruebe.
// Así que en vez de cerrar la puerta se acota QUÉ se puede sacar por ella:
//
//   1. La aprobación concede exactamente lo que la solicitud PIDIÓ. El conjunto
//      de funcionalidades otorgables se calcula en el servidor a partir del
//      objeto y la acción de la solicitud (las "candidatas", las mismas que ya
//      muestra `GET /solicitudes`). El `funcionalidadId` del body pasó de ser
//      LA orden a ser, como mucho, un desempate cuando hay más de una candidata:
//      si no está en el conjunto, se rechaza.
//   2. Ya no se CREA el vínculo `funcionalidad_objeto_acciones`. Crear vínculos
//      es reescribir contra qué funcionalidad matchea cada pantalla, o sea la
//      tabla que el motor consulta: es una operación de root
//      (`PUT /funcionalidades/:id/acciones`), y hacerla desde acá era la forma
//      de convertir "aprobar un pedido" en "recablear el modelo". Si el objeto
//      no está vinculado a ninguna funcionalidad, la aprobación se rechaza con
//      409 y un root tiene que vincularlo primero.
//   3. No se otorga nada que confiera privilegio sobre secapi. Ver
//      `funcionalidadConfierePrivilegio` en src/lib/permisos.ts: la regla está
//      definida por objeto/funcionalidad y no por ids mágicos.
//
// Transacción:
//   1. Valida solicitud PENDIENTE + funcionalidad candidata, activa y no privilegiada.
//   2. Upsert Acceso grant (usuario + funcionalidad).
//   3. Marca la solicitud APROBADA con auditoría.
// =====================================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Guard de /api/db (src/lib/auth/apiGuard.ts): nivel ADMIN sobre el objeto
  // `solicitudes` + acción `approve`. O sea root, o quien tenga otorgada la
  // funcionalidad de aprobación — exactamente lo que antes decidía a mano
  // `usuarioPuedeAprobar`, ahora por el mismo motor que el resto del panel.
  const guard = await requireApiAuth(request);
  if (!guard.ok) return guard.respuesta;

  try {
    // El guard ya resolvió al usuario (nivel ADMIN nunca pasa sin uno). Antes
    // acá se volvía a llamar a `resolveUsuario`, que es una segunda consulta y
    // —peor— una segunda oportunidad de que las dos resoluciones no coincidan.
    const usuario = guard.usuario;
    if (!usuario) {
      return NextResponse.json({ success: false, error: "NO_AUTORIZADO" }, { status: 401 });
    }

    const { id } = await params;
    const solicitudId = parseInt(id);
    if (isNaN(solicitudId)) {
      return NextResponse.json({ success: false, error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    // Sugerencia, no orden: solo se usa para desempatar entre las candidatas.
    const funcionalidadPedida = Number(body.funcionalidadId);
    const fechaDesde = body.fechaDesde ? new Date(body.fechaDesde) : null;
    const fechaHasta = body.fechaHasta ? new Date(body.fechaHasta) : null;
    const comentario = body.comentario ? String(body.comentario).slice(0, 1000) : null;

    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
      return NextResponse.json(
        { success: false, error: "fechaDesde debe ser <= fechaHasta" },
        { status: 400 },
      );
    }

    const solicitud = await prisma.solicitudPermiso.findUnique({
      where: { id: solicitudId },
    });
    if (!solicitud) {
      return NextResponse.json({ success: false, error: "Solicitud no encontrada" }, { status: 404 });
    }
    if (solicitud.estado !== "PENDIENTE") {
      return NextResponse.json(
        { success: false, error: `La solicitud ya está ${solicitud.estado}` },
        { status: 409 },
      );
    }

    // ── Qué se puede otorgar: lo que la solicitud pidió, y nada más ──────────
    //
    // Las candidatas son las funcionalidades ACTIVAS ya vinculadas al objeto de
    // la solicitud. El criterio de match con la acción es el MISMO que usa
    // `GET /solicitudes` para pintar las estrellitas: un vínculo con
    // `objetoAccionId` null cubre el objeto entero, y una solicitud sin acción
    // resuelta acepta cualquiera. Si los dos criterios divergieran, el panel
    // mostraría como otorgable algo que la aprobación después rechaza.
    const vinculos = await prisma.funcionalidadObjetoAccion.findMany({
      where: { objetoId: solicitud.objetoId, funcionalidad: { estado: "A" } },
      select: { objetoAccionId: true, funcionalidadId: true },
    });
    const candidatas = [
      ...new Set(
        vinculos
          .filter(
            (v) =>
              solicitud.objetoAccionId == null ||
              v.objetoAccionId == null ||
              v.objetoAccionId === solicitud.objetoAccionId,
          )
          .map((v) => v.funcionalidadId),
      ),
    ];

    if (candidatas.length === 0) {
      // Antes, este caso se "resolvía" creando el vínculo con la funcionalidad
      // que viniera en el body. Eso es recablear el modelo de permisos desde el
      // endpoint de aprobación, que es exactamente el agujero.
      return NextResponse.json(
        {
          success: false,
          error:
            "El objeto de esta solicitud no está vinculado a ninguna funcionalidad activa, " +
            "así que no hay nada que otorgar. Un root tiene que vincularlo primero " +
            "(Funcionalidades → acciones) y después se puede aprobar.",
          codigo: "SIN_FUNCIONALIDAD_VINCULADA",
        },
        { status: 409 },
      );
    }

    let funcionalidadId: number;
    if (candidatas.length === 1) {
      // El caso normal: la solicitud pidió una pantalla y hay una funcionalidad
      // que la protege. El body ni se mira.
      funcionalidadId = candidatas[0];
    } else if (candidatas.includes(funcionalidadPedida)) {
      funcionalidadId = funcionalidadPedida;
    } else {
      return NextResponse.json(
        {
          success: false,
          error:
            "Hay más de una funcionalidad que otorga lo que se pidió: elegí una de las " +
            "candidatas. Solo se puede otorgar una de ellas, no una funcionalidad cualquiera.",
          codigo: "FUNCIONALIDAD_FUERA_DE_LA_SOLICITUD",
          candidatas,
        },
        { status: 400 },
      );
    }

    const funcionalidad = await prisma.funcionalidad.findFirst({
      where: { id: funcionalidadId, estado: "A" },
      select: { id: true },
    });
    if (!funcionalidad) {
      return NextResponse.json(
        { success: false, error: "Funcionalidad no encontrada o inactiva" },
        { status: 400 },
      );
    }

    // Última barrera: aunque la funcionalidad sea la que pidió la solicitud, si
    // otorga administración de secapi no sale por acá. Un root la otorga a mano.
    if (await funcionalidadConfierePrivilegio(funcionalidadId)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Esa funcionalidad otorga administración de SecuritySuite y no se puede conceder " +
            "aprobando una solicitud: tiene que otorgarla un root, asignando el rol o el " +
            "acceso directo. Rechazá la solicitud y avisale a un administrador.",
          codigo: "FUNCIONALIDAD_PRIVILEGIADA",
        },
        { status: 403 },
      );
    }

    const now = new Date();
    const resultado = await prisma.$transaction(async (tx) => {
      // 2. Upsert Acceso grant
      await tx.acceso.upsert({
        where: {
          funcionalidadId_usuarioId: {
            funcionalidadId,
            usuarioId: solicitud.usuarioId,
          },
        },
        update: {
          efecto: EFECTO_GRANT,
          creadoEn: usuario.username,
          fechaDesde,
          fechaHasta,
        },
        create: {
          funcionalidadId,
          usuarioId: solicitud.usuarioId,
          efecto: EFECTO_GRANT,
          creadoEn: usuario.username,
          fechaDesde,
          fechaHasta,
        },
      });

      // 3. Marcar APROBADA
      const actualizada = await tx.solicitudPermiso.update({
        where: { id: solicitudId },
        data: {
          estado: "APROBADA",
          funcionalidadId,
          resueltaPor: usuario.id,
          fechaResolucion: now,
          comentarioResolucion: comentario,
        },
      });
      return actualizada;
    });

    return NextResponse.json({ success: true, solicitud: resultado, accesoCreado: true });
  } catch (error) {
    console.error("[API/db/solicitudes/[id]/aprobar POST]", error);
    return NextResponse.json(
      { success: false, error: "Error al aprobar la solicitud" },
      { status: 500 },
    );
  }
}
