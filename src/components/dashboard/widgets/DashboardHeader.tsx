"use client";

import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock } from "lucide-react";

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
  lastUpdated = "2 min"
}: DashboardHeaderProps) {
  const statusConfig = {
    active: {
      color: "bg-green-50 text-green-700 border-green-200",
      icon: CheckCircle,
      text: "Sistema Activo"
    },
    maintenance: {
      color: "bg-yellow-50 text-yellow-700 border-yellow-200",
      icon: Clock,
      text: "Mantenimiento"
    },
    error: {
      color: "bg-red-50 text-red-700 border-red-200",
      icon: CheckCircle,
      text: "Sistema con Errores"
    }
  };

  const StatusIcon = statusConfig[systemStatus].icon;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            {title}
          </h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className={statusConfig[systemStatus].color}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {statusConfig[systemStatus].text}
          </Badge>
          <div className="text-sm text-muted-foreground flex items-center">
            <Clock className="w-4 h-4 inline mr-1" />
            Actualizado hace {lastUpdated}
          </div>
        </div>
      </div>
    </div>
  );
}