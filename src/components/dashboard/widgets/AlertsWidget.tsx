"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Shield, Clock, CheckCircle2, ArrowRight } from "lucide-react";

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

const alertConfig: Record<
  AlertType["type"],
  { icon: React.ComponentType<{ className?: string }>; dot: string; label: string }
> = {
  security: { icon: Shield, dot: "bg-destructive", label: "Seguridad" },
  warning: { icon: AlertTriangle, dot: "bg-warning", label: "Advertencia" },
  info: { icon: Clock, dot: "bg-primary", label: "Info" },
  success: { icon: CheckCircle2, dot: "bg-success", label: "OK" },
};

export function AlertsWidget({
  alerts = [
    {
      id: "1",
      type: "security",
      title: "Intento de acceso no autorizado",
      description: "Se detectó un intento de acceso desde una IP no reconocida",
      timestamp: "Hace 5 minutos",
    },
    {
      id: "2",
      type: "warning",
      title: "Mantenimiento programado",
      description: "Mantenimiento del servidor programado para las 02:00 AM",
      timestamp: "Hace 2 horas",
    },
    {
      id: "3",
      type: "success",
      title: "Sistema actualizado",
      description: "Actualización de seguridad completada exitosamente",
      timestamp: "Hace 1 día",
    },
  ],
  maxAlerts = 5,
}: AlertsWidgetProps) {
  const displayAlerts = alerts.slice(0, maxAlerts);

  return (
    <Card className="h-full rounded-2xl border">
      <CardHeader className="pb-3 px-6 pt-6">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            Alertas del Sistema
          </span>
          {alerts.length > maxAlerts && (
            <span className="text-xs text-muted-foreground">
              +{alerts.length - maxAlerts} más
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="px-6 pb-6">
        {displayAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
            <CheckCircle2 className="h-10 w-10 text-success opacity-70" />
            <p className="text-sm font-medium">Todo en orden</p>
            <p className="text-xs">No hay alertas activas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayAlerts.map((alert) => {
              const cfg = alertConfig[alert.type];
              const Icon = cfg.icon;

              return (
                <div
                  key={alert.id}
                  className="group flex items-start gap-3 rounded-xl border bg-muted/30 px-4 py-3 transition-all hover:bg-muted/50 hover:shadow-sm"
                >
                  {/* Severity dot + icon */}
                  <div className="relative mt-0.5 flex-shrink-0">
                    <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${cfg.dot}`} />
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-card border">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{alert.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                      {alert.description}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground/70">
                      <Clock className="h-3 w-3" />
                      <span>{alert.timestamp}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Footer link */}
            <button className="flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
              Ver todas las alertas
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
