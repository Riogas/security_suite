"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";
import { useLoading } from "@/lib/LoadingProvider";

export const usePageTransition = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const { showLoading, hideLoading } = useLoading();

  const navigateWithLoading = useCallback(
    (
      path: string,
      options?: {
        loadingText?: string;
        replace?: boolean;
      },
    ) => {
      const { loadingText = "Navegando...", replace = false } = options || {};

      // No hacer nada si ya estamos en esa página
      if (pathname === path) return;

      showLoading(loadingText);

      startTransition(() => {
        if (replace) {
          router.replace(path);
        } else {
          router.push(path);
        }

        // Ocultar loading después de un breve delay para suavizar la transición
        setTimeout(() => {
          hideLoading();
        }, 300);
      });
    },
    [router, pathname, showLoading, hideLoading],
  );

  const goBack = useCallback(
    (loadingText = "Regresando...") => {
      showLoading(loadingText);

      startTransition(() => {
        router.back();
        setTimeout(() => {
          hideLoading();
        }, 300);
      });
    },
    [router, showLoading, hideLoading],
  );

  return {
    navigateWithLoading,
    goBack,
    isPending: isPending,
  };
};
