"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { LoadingOverlay } from "@/components/ui/loading";

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
  const [forceHideTimeout, setForceHideTimeout] =
    useState<NodeJS.Timeout | null>(null);

  const showLoading = (text = "Cargando...") => {
    if (forceHideTimeout) {
      clearTimeout(forceHideTimeout);
      setForceHideTimeout(null);
    }

    setLoadingText(text);
    setIsLoading(true);

    // Safety timer: force-hide after 3 seconds maximum
    const forceHide = setTimeout(() => {
      setIsLoading(false);
      setForceHideTimeout(null);
    }, 3000);

    setForceHideTimeout(forceHide);
  };

  const hideLoading = () => {
    if (forceHideTimeout) {
      clearTimeout(forceHideTimeout);
      setForceHideTimeout(null);
    }

    setIsLoading(false);
  };

  const setAutoLoading = (enabled: boolean) => {
    setIsAutoLoading(enabled);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (forceHideTimeout) {
        clearTimeout(forceHideTimeout);
      }
    };
  }, [forceHideTimeout]);

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
