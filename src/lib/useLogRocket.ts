import { useEffect } from "react";
import LogRocket from "logrocket";

declare global {
  interface Window {
    LogRocket?: boolean;
  }
}

export function useLogRocket() {
  useEffect(() => {
    // Solo inicializar en el cliente y una vez
    if (typeof window !== "undefined" && !window.LogRocket) {
      LogRocket.init("w2ree2/securitysuite");
      window.LogRocket = true; // Marcar como inicializado
    }
  }, []);
}
