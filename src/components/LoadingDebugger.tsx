"use client";

import { useLoading } from "@/lib/LoadingProvider";

// Solo mostrar en desarrollo
const isDev = process.env.NODE_ENV === 'development';

export const LoadingDebugger: React.FC = () => {
  const { isLoading, loadingText } = useLoading();
  
  if (!isDev || !isLoading) return null;
  
  return (
    <div className="fixed top-4 right-4 z-[60] bg-red-500 text-white p-2 rounded text-xs">
      <div>🔄 Loading: {loadingText}</div>
    </div>
  );
};