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
      const link = target.closest('a[href]') as HTMLAnchorElement;
      const button = target.closest('button') as HTMLButtonElement;
      
      if (link && link.href && !link.href.startsWith('http') && !link.href.includes('#')) {
        showLoading("Cargando página...");
      }
      
      if (button && button.onclick) {
        const onClickStr = button.onclick.toString();
        if (onClickStr.includes('router.push') || onClickStr.includes('navigate')) {
          showLoading("Navegando...");
        }
      }
    };

    // Interceptar fetch requests automáticamente
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = args[0] as string;
      
      // Solo mostrar loading para APIs, no para assets
      if (typeof url === 'string' && (url.includes('/api/') || url.startsWith('/'))) {
        const isApiCall = url.includes('listar') || url.includes('abm') || url.includes('crear');
        if (isApiCall) {
          showLoading("Procesando...");
        }
      }
      
      try {
        const response = await originalFetch(...args);
        return response;
      } finally {
        setTimeout(() => hideLoading(), 500);
      }
    };

    // Event listeners
    document.addEventListener('click', handleNavigationClick, true);
    
    // Cleanup
    return () => {
      document.removeEventListener('click', handleNavigationClick, true);
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