"use client";

import { useEffect } from "react";
import { useLoading } from "@/lib/LoadingProvider";
import { registerLoadingProvider } from "@/lib/loadingInterceptor";

export const LoadingInitializer: React.FC = () => {
  const loadingContext = useLoading();

  useEffect(() => {
    // Registrar el contexto de loading con el interceptor
    registerLoadingProvider(loadingContext);

    // Interceptar clicks en botones y elementos que pueden navegar
    const handleClick = (event: Event) => {
      const target = event.target as HTMLElement;
      const button = target.closest("button") as HTMLButtonElement;

      if (button) {
        // Detectar si el botón podría navegar
        const buttonText = button.textContent?.toLowerCase() || "";
        const hasNavigationKeywords = [
          "nueva",
          "crear",
          "editar",
          "ver",
          "abrir",
          "ir a",
          "roles",
          "usuarios",
          "funcionalidades",
          "permisos",
          "objetos",
          "aplicaciones",
          "dashboard",
        ].some((keyword) => buttonText.includes(keyword));

        // Si el botón tiene un ícono de navegación o texto que sugiere navegación
        const hasNavIcon = button.querySelector("svg") !== null;

        if (hasNavigationKeywords || hasNavIcon) {
          // Pequeño delay para mostrar loading después del click
          setTimeout(() => {
            loadingContext.showLoading("Navegando...");
          }, 50);
        }
      }
    };

    // Agregar listener para clicks
    document.addEventListener("click", handleClick, { capture: true });

    // Cleanup
    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, [loadingContext]);

  return null; // Este componente no renderiza nada
};
