"use client";

import { useEsRoot } from "@/hooks/useEsRoot";

/**
 * ¿Puede el usuario logueado ADMINISTRAR el modelo de permisos?
 *
 * Este hook es EL criterio, en un solo lugar. Las ~20 escrituras del panel que
 * el guard subió a nivel ROOT (asignar roles, ABM de roles, funcionalidades,
 * objetos, accesos directos, aplicaciones y el builder de menú — ver la tabla
 * POLITICAS en src/lib/auth/apiGuard.ts) preguntan por acá, y ninguna pantalla
 * mira `esRoot` por su cuenta.
 *
 * Por qué existe además de `useEsRoot()`, si hoy devuelve exactamente lo mismo:
 * porque son dos cosas distintas que hoy coinciden. `useEsRoot()` responde un
 * HECHO ("tengo el rol Root de secapi"); esto responde una POLÍTICA ("se me
 * permite tocar quién tiene qué"). La política está en discusión con el dueño y
 * puede pasar a ser "root O la funcionalidad que un root me haya otorgado".
 * Cuando eso pase, el cambio es ACÁ ADENTRO y en ningún otro archivo: las
 * pantallas no saben qué es root, solo preguntan si pueden.
 *
 * Fail-closed mientras carga, igual que `useEsRoot()`: se prefiere mostrar un
 * botón bloqueado de más y que se habilite solo, a mostrarlo habilitado y que
 * el endpoint conteste 403 después de que la persona llenó el formulario.
 *
 * OJO: esto es un gate de PRESENTACIÓN. La autorización de verdad la sigue
 * haciendo `requireApiAuth` en el servidor; acá solo se evita que la UI ofrezca
 * una escritura que ya se sabe que va a ser rechazada.
 */

/**
 * Motivo que se le muestra a la persona. Único, así los quince tooltips del
 * panel no se van diciendo cosas distintas. Si mañana la política cambia,
 * cambia también este texto y cambia en todos lados de una.
 */
export const MOTIVO_SIN_PERMISO = "Requiere permisos de root";

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
  /** `true` sólo si el servidor va a aceptar la escritura. */
  puede: boolean;
  /** `true` mientras `GET /api/db/usuarios/yo` está en vuelo. */
  cargando: boolean;
  /** Texto a mostrar cuando `puede` es `false`. */
  motivo: string;
}

export function usePuedeAdministrar(): PuedeAdministrar {
  // Hoy la política ES el rol Root. `useEsRoot` cachea la promesa a nivel de
  // módulo, así que las N pantallas que monten esto comparten UN solo
  // `GET /usuarios/yo` por carga del bundle.
  const { esRoot, cargando, fallo } = useEsRoot();

  // El bloqueo es el mismo en los tres casos (fail-closed); lo que cambia es
  // qué se le dice a la persona.
  const motivo = cargando
    ? MOTIVO_VERIFICANDO
    : fallo
      ? MOTIVO_NO_VERIFICADO
      : MOTIVO_SIN_PERMISO;

  return { puede: esRoot, cargando, motivo };
}
