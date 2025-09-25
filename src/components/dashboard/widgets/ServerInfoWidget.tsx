"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Server, 
  Database, 
  Wifi, 
  Clock,
  CheckCircle,
  AlertTriangle
} from "lucide-react";

interface ServerInfoWidgetProps {
  serverName?: string;
  uptime?: string;
  status?: "online" | "maintenance" | "offline";
  version?: string;
  lastBackup?: string;
}

export function ServerInfoWidget({ 
  serverName = "SEC-SRV-01",
  uptime = "15d 7h 23m",
  status = "online",
  version = "v2.1.4",
  lastBackup = "Hace 2 horas"
}: ServerInfoWidgetProps) {

  const getStatusConfig = (status: "online" | "maintenance" | "offline") => {
    const configs = {
      online: {
        icon: CheckCircle,
        color: "text-green-600",
        bgColor: "bg-green-50 border-green-200",
        badgeColor: "bg-green-100 text-green-700",
        text: "En Línea"
      },
      maintenance: {
        icon: AlertTriangle,
        color: "text-yellow-600",
        bgColor: "bg-yellow-50 border-yellow-200",
        badgeColor: "bg-yellow-100 text-yellow-700",
        text: "Mantenimiento"
      },
      offline: {
        icon: AlertTriangle,
        color: "text-red-600",
        bgColor: "bg-red-50 border-red-200",
        badgeColor: "bg-red-100 text-red-700",
        text: "Fuera de Línea"
      }
    };
    return configs[status];
  };

  const statusConfig = getStatusConfig(status);
  const StatusIcon = statusConfig.icon;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Server className="w-5 h-5" />
            <span>Información del Servidor</span>
          </div>
          <Badge variant="outline" className={statusConfig.badgeColor}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {statusConfig.text}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Server Details */}
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center space-x-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Servidor</span>
            </div>
            <span className="text-sm text-muted-foreground">{serverName}</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Tiempo Activo</span>
            </div>
            <span className="text-sm text-muted-foreground">{uptime}</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center space-x-2">
              <Database className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Versión</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {version}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center space-x-2">
              <Database className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Último Backup</span>
            </div>
            <span className="text-sm text-muted-foreground">{lastBackup}</span>
          </div>
        </div>

        {/* Connection Status */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">Estado de Conexiones</h4>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Database className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Base de Datos</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs text-green-600">Conectado</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Wifi className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Red Externa</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs text-green-600">Activa</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Server className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">API Externa</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs text-green-600">Disponible</span>
              </div>
            </div>
          </div>
        </div>

        {/* Resource Usage Summary */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">Uso General de Recursos</h4>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span>Sistema General</span>
              <span className="text-green-600 font-medium">Óptimo</span>
            </div>
            <Progress value={78} className="h-1" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}