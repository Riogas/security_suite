// =====================================================================
// Keys del modelo de permisos, sin dependencias.
//
// Este módulo existe por una razón concreta y no por prolijidad: los hooks del
// panel (`usePuedeAdministrar`) necesitan la misma `accionKey` que usa el guard
// del servidor, y `src/lib/permisos.ts` importa Prisma y `next/server`. Un
// `import` desde un componente "use client" se llevaría el cliente de Prisma
// entero al bundle del navegador.
//
// Regla: acá adentro van SOLO constantes de texto. Cero imports. Si algo
// necesita la base o el request, va en permisos.ts, que reexporta esto.
// =====================================================================

/**
 * Acción por defecto de una pantalla del panel. El andamiaje que hay sembrado
 * en la base (un objeto PAGE por pantalla, con UNA sola `objeto_accion` `view`,
 * y una funcionalidad colgada de esa acción) usa esta y ninguna otra. Ver el
 * bloque "Qué acción se chequea" en src/lib/auth/apiGuard.ts.
 */
export const ACCION_VIEW = "view";

/** Objeto + acción que designan a un usuario como aprobador de solicitudes. */
export const APROBADOR_OBJETO_KEY = "solicitudes";
export const APROBADOR_ACCION_KEY = "approve";

/**
 * Qué acción chequea la política ADMIN de cada objeto del panel.
 *
 * Existe porque el gate visual y el guard tienen que preguntar EXACTAMENTE lo
 * mismo, y `solicitudes` es la excepción: su política declara `approve`, no
 * `view`. Con la acción hardcodeada en `"view"`, el hook le apagaba los botones
 * de Aprobar y Rechazar al aprobador que no es root — o sea justo a la única
 * persona para la que existe ese flujo. Hoy eso no se ve por casualidad: dos
 * seeds distintos terminaron colgando la funcionalidad 30 de `approve` Y de
 * `view`. En cuanto exista una funcionalidad colgada solo de `solicitudes.view`
 * —que es lo natural para "ver solicitudes"— el gate se invierte y ofrece un
 * botón que el servidor rechaza.
 *
 * `scripts/test-motor-secapi.ts` verifica que este mapa coincida con la tabla
 * POLITICAS: si alguien agrega una política ADMIN con acción propia y no la
 * declara acá, el test falla.
 */
export function accionDeObjetoAdmin(objetoKey: string): string {
  return objetoKey === APROBADOR_OBJETO_KEY ? APROBADOR_ACCION_KEY : ACCION_VIEW;
}
