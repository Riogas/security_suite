"use client";

import * as React from "react";
import { Lock } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  usePuedeAdministrar,
  type AlcanceAdministracion,
} from "@/hooks/usePuedeAdministrar";
import { cn } from "@/lib/utils";

/**
 * Controles que se apagan solos cuando el servidor no va a aceptar la
 * escritura.
 *
 * El problema que resuelven: el panel le mostraba los botones de crear, guardar
 * y borrar a todo el mundo, y el guard de /api/db (src/lib/auth/apiGuard.ts)
 * contesta 403 a los ~20 endpoints que pueden alterar quién tiene qué. Una
 * persona que no es root abría la pantalla, llenaba el formulario entero,
 * apretaba Guardar y RECIÉN AHÍ se enteraba. El error tiene que llegar antes
 * del trabajo, no después.
 *
 * Decisión: DESHABILITADO CON EL MOTIVO, no escondido. Esconder el botón hace
 * que la persona crea que la función no existe y termine preguntando por
 * Soporte; un botón gris que al pasar por arriba dice por qué se explica solo.
 *
 * Quién decide: `usePuedeAdministrar(alcance)`, y nadie más. Estos componentes
 * no saben qué es root — preguntan si se puede. Ver el comentario del hook.
 *
 * ── El prop `alcance`, y por qué es obligatorio ──────────────────────────────
 *
 * Desde que el guard tiene el nivel ADMIN, "¿puedo?" depende de QUÉ. Cada
 * control declara contra qué se lo pregunta:
 *
 *   <BotonRoot alcance="ROOT">        → operación no delegable (root y nadie más)
 *   <BotonRoot alcance="usuarios">    → nivel ADMIN sobre el objeto `usuarios`
 *
 * Es obligatorio a propósito: si fuera opcional con default "ROOT", cada
 * pantalla ADMIN nueva nacería escondiéndole el botón a la gente que SÍ lo tiene
 * habilitado, y nadie se enteraría. Siendo obligatorio, no compila hasta que
 * alguien decida. El valor tiene que coincidir con el nivel real del endpoint en
 * POLITICAS (src/lib/auth/apiGuard.ts); `scripts/test-ui-gates-root.ts` lo
 * verifica por análisis estático.
 *
 * El nombre "Root" del componente quedó del momento en que todo lo cerrado era
 * de root. Hoy es impreciso; se dejó para no tocar los 18 archivos que lo
 * importan por un rename.
 */

type PropsBoton = React.ComponentProps<typeof Button>;

export interface BotonRootProps extends PropsBoton {
  /**
   * Contra qué se pregunta: `"ROOT"` para lo no delegable, o la `objetoKey` de
   * la política ADMIN que protege el endpoint que este botón va a llamar.
   */
  alcance: AlcanceAdministracion;
  /**
   * Texto del tooltip cuando está bloqueado. Por defecto el motivo que arma el
   * hook; sólo se pisa cuando conviene ser más específico (p. ej. explicar que
   * los cambios del árbol tampoco se van a poder guardar).
   */
  motivo?: string;
}

/**
 * `<Button>` que se deshabilita solo cuando la persona no puede administrar
 * permisos, con un tooltip que dice por qué.
 *
 * Acepta las mismas props que `<Button>`: `variant`, `size`, `type="submit"`,
 * `disabled` propio (el de "guardando…"), `aria-label`, etc. El `disabled`
 * propio y el del gate se suman — nunca se pisan.
 */
export function BotonRoot({ alcance, motivo, disabled, onClick, ...props }: BotonRootProps) {
  const { puede, motivo: motivoPorDefecto } = usePuedeAdministrar(alcance);

  if (puede) {
    return <Button disabled={disabled} onClick={onClick} {...props} />;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/*
          El <span> NO es decorativo: un <button disabled> no emite eventos de
          puntero, así que sin un envoltorio que sí los emita el tooltip no se
          abre nunca y el botón queda gris sin explicación. Es `inline-flex`
          para no romper los contenedores con `gap-*` ni con `space-x-*` donde
          viven estos botones.
        */}
        <span className="inline-flex">
          {/* Sin `onClick`: el disabled ya lo impide, pero no se pasa un
              handler de escritura a un control bloqueado. */}
          <Button {...props} disabled />
        </span>
      </TooltipTrigger>
      <TooltipContent>{motivo ?? motivoPorDefecto}</TooltipContent>
    </Tooltip>
  );
}

export interface AvisoSoloRootProps {
  /**
   * Qué es lo que no se va a poder guardar, en minúscula y sin punto final:
   * "los cambios del rol", "el árbol de menú". Se arma la frase con eso.
   */
  que: string;
  /** Ídem `BotonRoot`: `"ROOT"` o la `objetoKey` de la política ADMIN. */
  alcance: AlcanceAdministracion;
  className?: string;
}

/**
 * Cartel de "esto es de sólo lectura" para las pantallas de alta y edición que
 * son una RUTA PROPIA (`/dashboard/roles/crear`, `/dashboard/objetos/editar/12`,
 * el builder de menú…).
 *
 * Hace falta además del botón gateado porque a esas rutas se entra por URL, por
 * un favorito o por el botón "Editar" de la grilla — que sigue habilitado a
 * propósito, porque abrir la ficha es una LECTURA y las lecturas quedan
 * abiertas. Sin el cartel, la persona ve un formulario editable y descubre el
 * problema al final; con el cartel, lo sabe antes de escribir el primer campo.
 *
 * Mientras `usePuedeAdministrar()` está cargando no se muestra nada: el gate de
 * verdad es el botón (que arranca deshabilitado), y hacer aparecer y
 * desaparecer un cartel rojo en cada carga de pantalla para los dos roots que
 * hay es peor que esperar la respuesta.
 */
export function AvisoSoloRoot({ que, alcance, className }: AvisoSoloRootProps) {
  const { puede, cargando, motivo } = usePuedeAdministrar(alcance);

  if (puede || cargando) return null;

  return (
    <Alert className={cn("border-amber-500/40 bg-amber-500/5", className)}>
      <Lock className="text-amber-600 dark:text-amber-500" />
      <AlertTitle>Sólo lectura</AlertTitle>
      <AlertDescription>
        <p>
          Podés ver esta pantalla, pero no vas a poder guardar {que}: {motivo.toLowerCase()}.
        </p>
      </AlertDescription>
    </Alert>
  );
}
