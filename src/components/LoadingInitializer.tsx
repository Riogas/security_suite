"use client";

import { useEffect } from "react";
import { useLoading } from "@/lib/LoadingProvider";
import { registerLoadingProvider } from "@/lib/loadingInterceptor";

export const LoadingInitializer: React.FC = () => {
  const loadingContext = useLoading();

  useEffect(() => {
    // Register the loading context with the axios interceptor so it can
    // trigger showLoading/hideLoading after the 600ms delay threshold.
    registerLoadingProvider(loadingContext);
  }, [loadingContext]);

  return null;
};
