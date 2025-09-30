"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { LoadingOverlay } from "@/components/ui/loading";
import { usePathname, useRouter } from "next/navigation";

interface LoadingContextType {
  isLoading: boolean;
  showLoading: (text?: string) => void;
  hideLoading: () => void;
  loadingText: string;
  setAutoLoading: (enabled: boolean) => void;
  isAutoLoading: boolean;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error("useLoading must be used within a LoadingProvider");
  }
  return context;
};

interface LoadingProviderProps {
  children: ReactNode;
}

export const LoadingProvider: React.FC<LoadingProviderProps> = ({
  children,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Cargando...");
  const [isAutoLoading, setIsAutoLoading] = useState(true);
  const [loadingTimeout, setLoadingTimeout] = useState<NodeJS.Timeout | null>(
    null,
  );
  const [forceHideTimeout, setForceHideTimeout] =
    useState<NodeJS.Timeout | null>(null);

  const pathname = usePathname();

  const showLoading = (text = "Cargando...") => {
    // Limpiar timeouts anteriores si existen
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
      setLoadingTimeout(null);
    }
    if (forceHideTimeout) {
      clearTimeout(forceHideTimeout);
      setForceHideTimeout(null);
    }

    setLoadingText(text);
    setIsLoading(true);

    // Timer de seguridad para forzar que se oculte después de 3 segundos máximo
    const forceHide = setTimeout(() => {
      setIsLoading(false);
      setForceHideTimeout(null);
    }, 3000);

    setForceHideTimeout(forceHide);
  };

  const hideLoading = () => {
    // Limpiar timeouts anteriores si existen
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
      setLoadingTimeout(null);
    }
    if (forceHideTimeout) {
      clearTimeout(forceHideTimeout);
      setForceHideTimeout(null);
    }

    // Usar timeout muy corto para suavizar la transición
    const timeout = setTimeout(() => {
      setIsLoading(false);
    }, 50);

    setLoadingTimeout(timeout);
  };

  const setAutoLoading = (enabled: boolean) => {
    setIsAutoLoading(enabled);
  };

  // Auto-loading en cambios de ruta
  useEffect(() => {
    if (!isAutoLoading) return;

    // Mostrar loading inmediatamente al cambiar de ruta
    showLoading("Navegando...");

    // Ocultar loading después de que la página se haya cargado
    const hideTimer = setTimeout(() => {
      hideLoading();
    }, 800); // Tiempo más corto

    return () => {
      clearTimeout(hideTimer);
      // Force hide loading cuando se limpia el efecto
      setIsLoading(false);
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        setLoadingTimeout(null);
      }
      if (forceHideTimeout) {
        clearTimeout(forceHideTimeout);
        setForceHideTimeout(null);
      }
    };
  }, [pathname, isAutoLoading]);

  // Interceptar fetch automáticamente si está habilitado
  useEffect(() => {
    if (!isAutoLoading) return;

    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      const url = args[0] as string;

      // Detectar tipo de API call por la URL
      let loadingMessage = "Procesando...";
      if (typeof url === "string") {
        if (url.includes("listarObjetos"))
          loadingMessage = "Cargando objetos...";
        else if (url.includes("listarFuncionalidades"))
          loadingMessage = "Cargando funcionalidades...";
        else if (url.includes("abmFuncionalidades"))
          loadingMessage = "Guardando funcionalidad...";
        else if (url.includes("listar")) loadingMessage = "Cargando datos...";
        else if (url.includes("abm")) loadingMessage = "Guardando cambios...";
        else if (url.includes("crear")) loadingMessage = "Creando...";
        else if (url.includes("editar")) loadingMessage = "Actualizando...";
        else if (url.includes("eliminar")) loadingMessage = "Eliminando...";
      }

      // Solo mostrar loading para APIs del proyecto
      const isProjectApi =
        typeof url === "string" &&
        (url.includes("listar") ||
          url.includes("abm") ||
          url.includes("crear") ||
          url.includes("editar") ||
          url.includes("eliminar") ||
          url.startsWith("/api/"));

      if (isProjectApi) {
        showLoading(loadingMessage);
      }

      try {
        const response = await originalFetch(...args);

        if (isProjectApi) {
          // Delay para mostrar el loading un momento
          setTimeout(() => hideLoading(), 300);
        }

        return response;
      } catch (error) {
        if (isProjectApi) {
          hideLoading();
        }
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [isAutoLoading]);

  // Cleanup timeouts al desmontar
  useEffect(() => {
    return () => {
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }
      if (forceHideTimeout) {
        clearTimeout(forceHideTimeout);
      }
    };
  }, [loadingTimeout, forceHideTimeout]);

  const value: LoadingContextType = {
    isLoading,
    showLoading,
    hideLoading,
    loadingText,
    setAutoLoading,
    isAutoLoading,
  };

  return (
    <LoadingContext.Provider value={value}>
      {children}
      <LoadingOverlay
        isVisible={isLoading}
        text={loadingText}
        variant="default"
      />
    </LoadingContext.Provider>
  );
};
