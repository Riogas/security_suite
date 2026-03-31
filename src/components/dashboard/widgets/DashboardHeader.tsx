"use client";

import { motion } from "framer-motion";
import { Clock } from "lucide-react";

interface DashboardHeaderProps {
  title?: string;
  subtitle?: string;
  systemStatus?: "active" | "maintenance" | "error";
  lastUpdated?: string;
}

export function DashboardHeader({
  title = "Panel de Control",
  subtitle = "Sistema de Seguridad y Gestión de Accesos",
  systemStatus = "active",
  lastUpdated = "2 min",
}: DashboardHeaderProps) {
  const statusConfig = {
    active: {
      dot: "bg-green-500",
      ping: "bg-green-400",
      label: "Sistema Activo",
      text: "text-green-400",
    },
    maintenance: {
      dot: "bg-yellow-500",
      ping: "bg-yellow-400",
      label: "Mantenimiento",
      text: "text-yellow-400",
    },
    error: {
      dot: "bg-red-500",
      ping: "bg-red-400",
      label: "Sistema con Errores",
      text: "text-red-400",
    },
  };

  const cfg = statusConfig[systemStatus];

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60">
              {title}
            </span>
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">{subtitle}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Animated status pill */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium
              border border-white/10 bg-card/60 backdrop-blur-sm ${cfg.text}`}
          >
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${cfg.ping}`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${cfg.dot}`}
              />
            </span>
            {cfg.label}
          </div>

          {/* Updated at */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1 rounded-full border border-border/40">
            <Clock className="w-3.5 h-3.5" />
            <span>Actualizado hace {lastUpdated}</span>
          </div>
        </div>
      </div>

      {/* Subtle animated divider */}
      <motion.div
        className="h-px bg-gradient-to-r from-transparent via-border to-transparent"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.25, ease: "easeOut" }}
      />
    </motion.div>
  );
}
