"use client";

import { useEffect, useState } from "react";
import { apiYoDB } from "@/services/api";

/**
 * ¿El usuario logueado es root de SecuritySuite?
 *
 * Se lo pregunta a secapi (`GET /api/db/usuarios/yo`) y NO a
 * `localStorage.user.isRoot`. Ese campo del localStorage lo escribe el login
 * del panel, que va por el passthrough a GeneXus y devuelve
 * SERVICIOS.USEREXTENDED.USEREXTENDEDESROOT: otra tabla, otra base, y en
 * producción con los valores INVERTIDOS respecto de secapi. Resultado concreto:
 * a dmedaglia el botón de "Importación masiva" le salía bloqueado aunque el
 * endpoint lo dejaba pasar, y al revés. Preguntando acá, la UI y el guard usan
 * el mismo criterio: el rol "Root" (ver src/lib/permisos.ts).
 *
 * Mientras carga devuelve `false`: fail-closed en la UI, igual que hacía la
 * versión con localStorage (ahí `user` también arrancaba en null). Se prefiere
 * mostrar un botón bloqueado de más y que se habilite, a mostrarlo habilitado y
 * que el endpoint conteste 403.
 *
 * Un error de red también deja `false` y no rompe la pantalla: es un gate de
 * presentación, la autorización de verdad la hace el servidor igual.
 */
/**
 * Respuesta compartida por todos los que monten el hook.
 *
 * Sin esto, cada componente que llama a `useEsRoot()` dispara su propio
 * `GET /usuarios/yo`: la pantalla de usuarios monta dos (la page, para el botón
 * de importación masiva, y la grilla) y eran dos requests idénticos por carga.
 * Se guarda la PROMESA y no el valor, así dos montajes simultáneos se cuelgan
 * del mismo request en vuelo en vez de largar dos.
 *
 * Se cachea a nivel de módulo y no en un contexto de React a propósito: no hay
 * un provider común que envuelva las dos pantallas, meter uno sería tocar el
 * layout, y el dato ("¿soy root?") no cambia dentro de una sesión — si cambia,
 * cambió el token, y eso implica un login nuevo y una carga entera del bundle.
 *
 * NO se usa AbortController: abortar un request compartido por desmontar UN
 * componente le rompería la respuesta a los otros. El resultado se descarta con
 * el flag `vivo`, que es lo que hacía falta de verdad.
 */
let promesaEsRoot: Promise<Resultado> | null = null;

/**
 * `fallo` distingue "el servidor dijo que NO sos root" de "no pudimos
 * preguntar". Los dos dejan `esRoot` en `false` —el gate sigue siendo
 * fail-closed— pero no se le dicen igual a la persona: a un root que se quedó
 * sin red hay que decirle que recargue, no que no tiene permisos. Sin esta
 * distinción, un 500 o un corte de red le apagaba a un root las quince
 * pantallas del panel con un cartel que además le mentía.
 */
interface Resultado {
  esRoot: boolean;
  fallo: boolean;
}

function pedirEsRoot(): Promise<Resultado> {
  if (!promesaEsRoot) {
    promesaEsRoot = apiYoDB()
      .then((r) => ({ esRoot: Boolean(r?.usuario?.esRootDeSecapi), fallo: false }))
      .catch(() => {
        // El 401 ya lo maneja dbFetch (limpia la sesión y manda al login).
        // Cualquier otro error: se queda en no-root, y se olvida la promesa
        // para que un remonte posterior pueda reintentar en vez de quedar
        // pegado a un error de red viejo.
        promesaEsRoot = null;
        return { esRoot: false, fallo: true };
      });
  }
  return promesaEsRoot;
}

export function useEsRoot(): { esRoot: boolean; cargando: boolean; fallo: boolean } {
  const [esRoot, setEsRoot] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;

    pedirEsRoot()
      .then((r) => {
        if (!vivo) return;
        setEsRoot(r.esRoot);
        setFallo(r.fallo);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });

    return () => {
      vivo = false;
    };
  }, []);

  return { esRoot, cargando, fallo };
}
