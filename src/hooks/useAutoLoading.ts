"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLoading } from "@/lib/LoadingProvider";

// Hook para interceptar automáticamente las navegaciones
export const useAutoLoading = () => {
  const { showLoading, hideLoading } = useLoading();

  useEffect(() => {
    const handleRouteChangeStart = () => {
      showLoading("Navegando...");
    };

    const handleRouteChangeComplete = () => {
      setTimeout(() => hideLoading(), 300); // Breve delay para suavizar
    };

    const handleRouteChangeError = () => {
      hideLoading();
    };

    // Interceptar clicks en links y botones que navegan
    const handleNavigationClick = (event: Event) => {
      const target = event.target as HTMLElement;
      const link = target.closest("a[href]") as HTMLAnchorElement;
      const button = target.closest("button") as HTMLButtonElement;

      // Ignorar elementos con data-no-loading="true"
      if (
        target.getAttribute("data-no-loading") === "true" ||
        target.closest('[data-no-loading="true"]')
      ) {
        return;
      }

      // Ignorar clicks dentro de Dialogs/Modals
      if (
        target.closest('[role="dialog"]') ||
        target.closest('[data-slot="dialog"]') ||
        target.closest('[data-slot="dialog-overlay"]') ||
        target.closest('[data-slot="dialog-portal"]')
      ) {
        return;
      }

      if (
        link &&
        link.href &&
        !link.href.startsWith("http") &&
        !link.href.includes("#")
      ) {
        showLoading("Cargando página...");
      }

      if (button && button.onclick) {
        const onClickStr = button.onclick.toString();
        if (
          onClickStr.includes("router.push") ||
          onClickStr.includes("navigate")
        ) {
          showLoading("Navegando...");
        }
      }
    };

    // Interceptar fetch requests automáticamente
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = args[0] as string;

      // Excluir llamadas de modales (cargas de datos)
      const isModalDataLoad =
        typeof url === "string" &&
        (url.includes("getAtributos") ||
          url.includes("getRoles") ||
          url.includes("getRolesAsignados") ||
          url.includes("get") && !url.includes("listar"));

      // Solo mostrar loading para APIs de acción, no para cargas de datos de modales
      if (
        typeof url === "string" &&
        !isModalDataLoad &&
        (url.includes("/api/") || url.startsWith("/"))
      ) {
        const isApiCall =
          url.includes("listar") ||
          url.includes("abm") ||
          url.includes("crear");
        if (isApiCall) {
          showLoading("Procesando...");
        }
      }

      try {
        const response = await originalFetch(...args);
        return response;
      } finally {
        // Solo ocultar loading si lo mostramos
        if (!isModalDataLoad) {
          setTimeout(() => hideLoading(), 500);
        }
      }
    };

    // Event listeners
    document.addEventListener("click", handleNavigationClick, true);

    // Cleanup
    return () => {
      document.removeEventListener("click", handleNavigationClick, true);
      window.fetch = originalFetch;
    };
  }, [showLoading, hideLoading]);
};

// Hook simplificado para mostrar loading manualmente
export const useAppLoading = () => {
  const { showLoading, hideLoading, isLoading, loadingText } = useLoading();

  return {
    showLoading,
    hideLoading,
    isLoading,
    loadingText,

    // Funciones de conveniencia
    showNavigationLoading: () => showLoading("Navegando..."),
    showApiLoading: (action = "Procesando") => showLoading(`${action}...`),
    showSaveLoading: () => showLoading("Guardando..."),
    showLoadLoading: () => showLoading("Cargando datos..."),
    showDeleteLoading: () => showLoading("Eliminando..."),
  };
};
