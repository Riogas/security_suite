import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import type { VerifiedBy } from "./types";
import { leerSecretoJwt } from "./verificarJwt";
import { aplicacionIdDeSecapi, aplicacionesRootDeUsuario } from "@/lib/permisos";

/*
 * El firmante usa EXACTAMENTE el mismo criterio que el verificador
 * (`leerSecretoJwt`). Antes tenía su propio `|| "security-suite-secret-key"`, y
 * eso dejaba firmante y verificador en desacuerdo por construcción: sin
 * JWT_SECRET seteada, el login devolvía 200 con un token firmado con el secreto
 * de compromiso que después TODOS los endpoints rechazaban. El operador veía
 * "el login anda" y buscaba el problema en cualquier otro lado.
 *
 * Ahora, sin secreto válido, el login corta en la puerta con 503.
 */

function emptyAuthBody(message: string) {
  return {
    success: false,
    message,
    token: "",
    user: null,
    expiresIn: "0",
    requireIdentity: false,
    verifiedBy: "",
  };
}

export function badRequest(message: string) {
  return NextResponse.json(emptyAuthBody(message), { status: 400 });
}

export function unauthorized(message = "Usuario sin privilegios para acceder al sistema.") {
  return NextResponse.json(emptyAuthBody(message), { status: 401 });
}

export function forbidden(message: string) {
  return NextResponse.json(emptyAuthBody(message), { status: 403 });
}

export function serverError(message = "Error interno del servidor") {
  return NextResponse.json(emptyAuthBody(message), { status: 500 });
}

// Construye la respuesta de éxito y, de paso, actualiza fechaUltimoLogin (solo en éxito).
// `applicableRolIds`: si no es null, filtra los roles del usuario al subconjunto aplicable
//   según el escenario activo. null significa sin filtro (todos los roles aplican).
// `escenario`: escenario activo del usuario al momento del login, para incluirlo en la respuesta.
export async function buildSuccessResponse(
  usuarioId: number,
  sistema: string,
  verifiedBy: VerifiedBy,
  applicableRolIds: number[] | null = null,
  escenario: { id: number; nombre: string } | null = null,
) {
  // Construimos la cláusula where de roles: si hay filtro por escenario, solo traemos
  // los roles que aplican. Esto asegura que el JWT y el payload no incluyen roles
  // de escenarios distintos al activo.
  const rolesWhere =
    applicableRolIds != null
      ? { usuarioId, rolId: { in: applicableRolIds } }
      : { usuarioId };

  const [usuario, roles, preferencias, accesos] = await Promise.all([
    prisma.usuario.update({
      where: { id: usuarioId },
      data: { fechaUltimoLogin: new Date() },
    }),
    prisma.usuarioRol.findMany({
      where: rolesWhere,
      include: {
        rol: {
          include: {
            funcionalidades: {
              select: {
                funcionalidadId: true,
                funcionalidad: { select: { nombre: true } },
              },
            },
            preferencias: {
              select: { atributo: true, valor: true },
            },
          },
        },
      },
    }),
    prisma.usuarioPreferencia.findMany({
      where: { usuarioId },
      select: { atributo: true, valor: true },
    }),
    prisma.acceso.findMany({
      where: { usuarioId },
      select: {
        funcionalidadId: true,
        efecto: true,
        funcionalidad: {
          select: {
            nombre: true,
            objetoAcciones: {
              select: {
                objetoAccion: {
                  select: { key: true, codigo: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const secreto = leerSecretoJwt();
  if (!secreto.ok) {
    console.error(`[login] no se puede emitir token: ${secreto.motivo}`);
    return NextResponse.json(
      { success: false, error: "SECRETO_NO_CONFIGURADO", message: "El servidor no está configurado para emitir sesiones." },
      { status: 503 },
    );
  }

  const token = jwt.sign(
    { iss: "security-suite", username: usuario.username, userId: usuario.id, sistema },
    secreto.secreto,
    { expiresIn: "7d" }
  );

  const nombre =
    [usuario.nombre, usuario.apellido].filter(Boolean).join(" ").trim() ||
    usuario.username;

  // `isRoot` viaja desde acá a GOYA, TrackMovil y Granel. Ya NO sale de la
  // columna `usuarios.es_root`: se calcula con el rol "Root" vigente, igual que
  // el guard (ver el bloque "Root por ROL" en src/lib/permisos.ts). Si siguiera
  // leyendo la columna, el mismo usuario daría root para el endpoint y no-root
  // para el front, que es exactamente el problema que se viene a cerrar.
  //
  // No se calcula con `roles` de más arriba a propósito: esa consulta puede
  // venir filtrada por escenario (`applicableRolIds`) y no mira ni la vigencia
  // de la asignación ni `roles.estado`. Root tiene que salir del mismo criterio
  // que usa el guard, sin excepciones.
  const aplicacionesRoot = await aplicacionesRootDeUsuario(usuario.id);

  // `isRoot` = root de SecuritySuite, y eso es CORRECTO para las cuatro
  // aplicaciones, no una aproximación.
  //
  // Vale la pena decirlo con todas las letras porque la lectura rápida es al
  // revés ("le está mandando 'S' a Granel a alguien que no tiene el rol Root de
  // Granel"): por decisión de alcance del dueño, el rol Root de secapi ES el
  // superusuario del ecosistema y da acceso a todo, así que GOYA, TrackMovil y
  // Granel tienen que recibir 'S'. Es el mismo alcance que tenía
  // `usuarios.es_root='S'`, que es lo que este campo transportaba antes. El
  // razonamiento largo está en `esRootDeAplicacion` (src/lib/permisos.ts).
  //
  // Lo que NO sabe este campo es la granularidad fina: es un char 'S'/'N' viejo
  // y el `Sistema` del login es texto libre. Por eso al lado viaja
  // `aplicacionesRoot`, que sí lleva el detalle por aplicación — un usuario con
  // el Root de GOYA y sin el de secapi recibe `isRoot: 'N'` y
  // `aplicacionesRoot: [3]`, y GOYA tiene con qué decidir bien.
  const esRootDeSecapi = aplicacionesRoot.includes(aplicacionIdDeSecapi());

  return NextResponse.json({
    success: true,
    message: "",
    token,
    expiresIn: "604800",
    requireIdentity: false,
    verifiedBy,
    user: {
      id: String(usuario.id),
      username: usuario.username.trim(),
      nombre,
      email: usuario.email || "",
      isRoot: esRootDeSecapi ? "S" : "N",
      // Aditivo: las aplicaciones donde el usuario tiene el rol Root. Es lo que
      // GOYA/TrackMovil/Granel deberían mirar en vez de `isRoot`.
      aplicacionesRoot,
    },
    escenario,
    roles: roles.map((ur) => ({
      rolId: ur.rolId,
      rolNombre: ur.rol.nombre,
      aplicacionId: ur.rol.aplicacionId,
      funcionalidades: ur.rol.funcionalidades.map((rf) => ({
        funcionalidadId: rf.funcionalidadId,
        nombre: rf.funcionalidad.nombre,
      })),
      atributos: ur.rol.preferencias.map((p) => ({ atributo: p.atributo, valor: p.valor })),
    })),
    preferencias: preferencias.map((p) => ({ atributo: p.atributo, valor: p.valor })),
    accesos: accesos.map((a) => ({
      funcionalidadId: a.funcionalidadId,
      funcionalidadNombre: a.funcionalidad.nombre,
      efecto: a.efecto,
      objetoAcciones: a.funcionalidad.objetoAcciones
        .map((foa) =>
          foa.objetoAccion ? { key: foa.objetoAccion.key, codigo: foa.objetoAccion.codigo } : null
        )
        .filter((x): x is { key: string; codigo: string | null } => x !== null),
    })),
  });
}
