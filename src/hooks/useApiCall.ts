"use client";

import { useState, useCallback } from "react";
import { useLoading } from "@/lib/LoadingProvider";

interface UseApiCallOptions {
  loadingText?: string;
  showGlobalLoading?: boolean;
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
}

export const useApiCall = <T = any>(
  apiFunction: (...args: any[]) => Promise<T>,
  options: UseApiCallOptions = {},
) => {
  const {
    loadingText = "Procesando...",
    showGlobalLoading = true,
    onSuccess,
    onError,
  } = options;

  const { showLoading, hideLoading } = useLoading();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  const execute = useCallback(
    async (...args: any[]) => {
      try {
        setIsLoading(true);
        setError(null);

        if (showGlobalLoading) {
          showLoading(loadingText);
        }

        const result = await apiFunction(...args);
        setData(result);

        if (onSuccess) {
          onSuccess(result);
        }

        return result;
      } catch (err: any) {
        const errorMessage = err?.message || "Error inesperado";
        setError(errorMessage);

        if (onError) {
          onError(err);
        }

        throw err;
      } finally {
        setIsLoading(false);
        if (showGlobalLoading) {
          hideLoading();
        }
      }
    },
    [
      apiFunction,
      loadingText,
      showGlobalLoading,
      showLoading,
      hideLoading,
      onSuccess,
      onError,
    ],
  );

  return {
    execute,
    isLoading,
    error,
    data,
    clearError: () => setError(null),
  };
};
