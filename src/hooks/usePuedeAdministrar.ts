"use client";

import { useEsRoot } from "@/hooks/useEsRoot";
import { accionDeObjetoAdmin } from "@/lib/permisosKeys";

/**
 * ¿Puede el usuario logueado ADMINISTRAR esta parte del modelo de permisos?
 *
 * Este hook es EL criterio, en un solo lugar. Las escrituras y las lecturas del
 * panel que el guard cerró (ver la tabla POLITICAS en src/lib/auth/apiGuard.ts)
 * preguntan por acá, y ninguna pantalla mira `esRoot` por su cuenta.
 *
 * ── Por qué ahora lleva un argumento ─────────────────────────────────────────
 *
 * Hasta el nivel ADMIN, "¿puedo administrar?" tenía UNA respuesta: sos root o
 * no sos. Con ADMIN pasa a tener una POR PANTALLA — se puede administrar
 * usuarios y no roles— así que la pregunta sin objeto ya no significa nada.
 *
 * El argumento es el ALCANCE de lo que se va a hacer, y tiene dos formas:
 *
 *   - `"ROOT"`: la operación es de root duro y NO es delegable. Son las que
 *     alteran quién tiene qué (asignar roles, ABM de roles, funcionalidades,
 *     objetos, accesos directos, aplicaciones, el builder de menú). Delegarlas
 *     sería delegar root con otro nombre.
 *   - una `objetoKey` del panel (`"usuarios"`, `"roles"`, `"acciones"`…): la
 *     operación es de nivel ADMIN y pasa con root O con la funcionalidad de esa
 *     pantalla otorgada. El mapeo pantalla → objetoKey es el MISMO de la tabla
 *     de políticas; si los dos no coinciden, el gate visual vuelve a mentir.
 *
 * Mentir tiene dos direcciones y las dos son malas: ofrecer un botón que el
 * servidor va a rechazar (la persona llena el formulario y come el 403), y
 * esconderle un botón a alguien que SÍ lo tiene habilitado. Esta segunda es la
 * que aparece si una pantalla ADMIN se queda preguntando por `"ROOT"`.
 *
 * Fail-closed mientras carga: se prefiere mostrar un botón bloqueado de más y
 * que se habilite solo, a mostrarlo habilitado y que el endpoint conteste 403
 * después de que la persona llenó el formulario.
 *
 * OJO: esto es un gate de PRESENTACIÓN. La autorización de verdad la sigue
 * haciendo `requireApiAuth` en el servidor; acá solo se evita que la UI ofrezca
 * una operación que ya se sabe que va a ser rechazada.
 */

/**
 * Alcance de una operación del panel. `"ROOT"` es el no-delegable; cualquier
 * otro string es la `objetoKey` de una política de nivel ADMIN.
 */
export type AlcanceAdministracion = "ROOT" | (string & {});

/** Nombres lindos para el tooltip. Si falta uno, se usa la key tal cual. */
const ETIQUETA_OBJETO: Record<string, string> = {
  usuarios: "usuarios",
  roles: "roles",
  aplicaciones: "aplicaciones",
  funcionalidades: "funcionalidades",
  acciones: "acciones",
  objetos: "objetos",
  menu: "menús",
  permisos: "permisos",
  solicitudes: "solicitudes de acceso",
};

/**
 * Motivo para las operaciones no delegables. Único, así los tooltips del panel
 * no se van diciendo cosas distintas.
 */
export const MOTIVO_SIN_PERMISO = "Requiere permisos de root";

/** Motivo para las operaciones de nivel ADMIN: estas SÍ se pueden pedir. */
export function motivoSinFuncionalidad(objetoKey: string): string {
  return `Requiere el permiso de administrar ${ETIQUETA_OBJETO[objetoKey] ?? objetoKey}`;
}

/**
 * Los otros dos estados en que el botón se muestra bloqueado, y que NO son
 * "no tenés permiso". Decirle "requiere permisos de root" a un root mientras
 * todavía se está averiguando —o porque se cayó la red— es mentirle, y encima
 * lo manda a pedir un permiso que ya tiene.
 */
export const MOTIVO_VERIFICANDO = "Verificando permisos…";
export const MOTIVO_NO_VERIFICADO =
  "No pudimos verificar tus permisos. Recargá la página.";

export interface PuedeAdministrar {
  /** `true` sólo si el servidor va a aceptar la operación. */
  puede: boolean;
  /** `true` mientras `GET /api/db/usuarios/yo` está en vuelo. */
  cargando: boolean;
  /** Texto a mostrar cuando `puede` es `false`. */
  motivo: string;
}

export function usePuedeAdministrar(alcance: AlcanceAdministracion): PuedeAdministrar {
  // `useEsRoot` cachea la promesa a nivel de módulo, así que las N pantallas
  // que monten esto comparten UN solo `GET /usuarios/yo` por carga del bundle.
  const { esRoot, cargando, fallo, administra } = useEsRoot();

  const esRootDuro = alcance === "ROOT";

  // Root pasa siempre, igual que en el guard. Para lo delegable se mira la
  // MISMA acción que chequea la política de ese objeto — no `view` fijo:
  // `solicitudes` declara `approve`, y preguntar por `view` le apagaba Aprobar
  // y Rechazar al aprobador no-root, que es para quien existe ese flujo.
  const puede = esRootDuro
    ? esRoot
    : esRoot || (administra[alcance] ?? []).includes(accionDeObjetoAdmin(alcance));

  // El bloqueo es el mismo en los tres casos (fail-closed); lo que cambia es
  // qué se le dice a la persona.
  const motivo = cargando
    ? MOTIVO_VERIFICANDO
    : fallo
      ? MOTIVO_NO_VERIFICADO
      : esRootDuro
        ? MOTIVO_SIN_PERMISO
        : motivoSinFuncionalidad(alcance);

  return { puede, cargando, motivo };
}
