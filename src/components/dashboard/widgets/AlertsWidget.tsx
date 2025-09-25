"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Shield, Clock, CheckCircle2 } from "lucide-react";

interface AlertType {
  id: string;
  type: "security" | "warning" | "info" | "success";
  title: string;
  description: string;
  timestamp: string;
}

interface AlertsWidgetProps {
  alerts?: AlertType[];
  maxAlerts?: number;
}

export function AlertsWidget({ 
  alerts = [
    {
      id: "1",
      type: "security",
      title: "Intento de acceso no autorizado",
      description: "Se detectó un intento de acceso desde una IP no reconocida",
      timestamp: "Hace 5 minutos"
    },
    {
      id: "2",
      type: "warning",
      title: "Mantenimiento programado",
      description: "Mantenimiento del servidor programado para las 02:00 AM",
      timestamp: "Hace 2 horas"
    },
    {
      id: "3",
      type: "success",
      title: "Sistema actualizado",
      description: "Actualización de seguridad completada exitosamente",
      timestamp: "Hace 1 día"
    }
  ],
  maxAlerts = 5
}: AlertsWidgetProps) {
  const getAlertConfig = (type: AlertType["type"]) => {
    const configs = {
      security: {
        icon: Shield,
        color: "bg-red-50 text-red-700 border-red-200",
        badgeColor: "bg-red-100 text-red-700"
      },
      warning: {
        icon: AlertTriangle,
        color: "bg-yellow-50 text-yellow-700 border-yellow-200",
        badgeColor: "bg-yellow-100 text-yellow-700"
      },
      info: {
        icon: Clock,
        color: "bg-blue-50 text-blue-700 border-blue-200",
        badgeColor: "bg-blue-100 text-blue-700"
      },
      success: {
        icon: CheckCircle2,
        color: "bg-green-50 text-green-700 border-green-200",
        badgeColor: "bg-green-100 text-green-700"
      }
    };
    return configs[type];
  };

  const displayAlerts = alerts.slice(0, maxAlerts);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5" />
            <span>Alertas del Sistema</span>
          </span>
          {alerts.length > maxAlerts && (
            <Badge variant="outline" className="text-xs">
              +{alerts.length - maxAlerts} más
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {displayAlerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500" />
            <p>No hay alertas activas</p>
          </div>
        ) : (
          displayAlerts.map((alert) => {
            const config = getAlertConfig(alert.type);
            const Icon = config.icon;
            
            return (
              <div
                key={alert.id}
                className={`p-3 rounded-lg border transition-all hover:shadow-sm ${config.color}`}
              >
                <div className="flex items-start space-x-3">
                  <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-medium truncate">{alert.title}</h4>
                      <Badge variant="outline" className={`text-xs ${config.badgeColor}`}>
                        {alert.type}
                      </Badge>
                    </div>
                    <p className="text-xs opacity-80 mb-1">{alert.description}</p>
                    <div className="flex items-center space-x-1 text-xs opacity-60">
                      <Clock className="w-3 h-3" />
                      <span>{alert.timestamp}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}