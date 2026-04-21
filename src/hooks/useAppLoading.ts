"use client";

import { useLoading } from "@/lib/LoadingProvider";

/**
 * Hook simplificado para usar el loading en componentes
 * El loading automático ya funciona para APIs y navegación,
 * pero este hook permite control manual cuando sea necesario
 */
export const useAppLoading = () => {
  const { showLoading, hideLoading, isLoading, setAutoLoading, isAutoLoading } =
    useLoading();

  return {
    // Control básico
    show: showLoading,
    hide: hideLoading,
    isVisible: isLoading,

    // Control de auto-loading
    enableAuto: () => setAutoLoading(true),
    disableAuto: () => setAutoLoading(false),
    isAutoEnabled: isAutoLoading,

    // Helpers para casos comunes con mejor UX
    showSaving: () => showLoading("💾 Guardando cambios..."),
    showLoading: (text?: string) => showLoading(text || "⏳ Cargando datos..."),
    showDeleting: () => showLoading("🗑️ Eliminando elemento..."),
    showNavigating: () => showLoading("🧭 Navegando..."),
    showProcessing: () => showLoading("⚙️ Procesando información..."),
    showConnecting: () => showLoading("🔗 Conectando con el servidor..."),

    // Wrapper para funciones async con auto-cleanup
    withLoading: async <T>(
      asyncFn: () => Promise<T>,
      loadingText = "⚙️ Procesando...",
    ): Promise<T> => {
      try {
        showLoading(loadingText);
        const result = await asyncFn();
        return result;
      } catch (error) {
        // En caso de error, también ocultar el loading
        throw error;
      } finally {
        setTimeout(() => hideLoading(), 100);
      }
    },
  };
};
