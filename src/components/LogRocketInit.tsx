"use client";
import { useEffect } from "react";
import LogRocket from "logrocket";

export default function LogRocketInit() {
  useEffect(() => {
    // Inicializar LogRocket solo una vez
    if (typeof window !== "undefined") {
      console.log("🎯 Inicializando LogRocket...");
      LogRocket.init("w2ree2/securitysuite");
      console.log("✅ LogRocket inicializado correctamente");

      // 🔍 Verificar Sentry DSN
      console.log("🔍 Sentry DSN:", process.env.NEXT_PUBLIC_SENTRY_DSN);
      console.log("🔍 NODE_ENV:", process.env.NODE_ENV);

      // Verificar si hay un usuario ya logueado
      try {
        const savedUser = localStorage.getItem("user");
        if (savedUser) {
          const user = JSON.parse(savedUser);
          LogRocket.identify(user.email || "user-" + Date.now(), {
            name: user.name,
            email: user.email,
            role: user.role,
            sessionType: "returning_user",
            lastLogin: new Date().toISOString(),
          });
          console.log(
            "👤 Usuario existente identificado en LogRocket:",
            user.name,
          );
        }
      } catch (error) {
        console.warn("⚠️ No se pudo cargar usuario guardado:", error);
      }

      // Generar eventos de prueba
      setTimeout(() => {
        LogRocket.track("App Loaded");
        console.log("📊 Evento de prueba enviado a LogRocket");
      }, 1000);
    }
  }, []);

  return null; // No renderiza nada
}
