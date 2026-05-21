"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Activity,
  LogIn,
  LogOut,
  UserPlus,
  Edit,
  Trash2,
  Shield,
  Settings,
  ArrowRight,
} from "lucide-react";

interface RecentActivity {
  id: string;
  type:
    | "login"
    | "logout"
    | "user_created"
    | "user_updated"
    | "user_deleted"
    | "role_assigned"
    | "permission_changed"
    | "system_config";
  user: string;
  description: string;
  timestamp: string;
  details?: string;
}

interface RecentActivitiesWidgetProps {
  activities?: RecentActivity[];
  maxActivities?: number;
}

const activityConfig: Record<
  RecentActivity["type"],
  { icon: React.ComponentType<{ className?: string }>; dot: string }
> = {
  login:              { icon: LogIn,    dot: "bg-success" },
  logout:             { icon: LogOut,   dot: "bg-primary/60" },
  user_created:       { icon: UserPlus, dot: "bg-primary" },
  user_updated:       { icon: Edit,     dot: "bg-warning" },
  user_deleted:       { icon: Trash2,   dot: "bg-destructive" },
  role_assigned:      { icon: Shield,   dot: "bg-primary" },
  permission_changed: { icon: Settings, dot: "bg-warning" },
  system_config:      { icon: Settings, dot: "bg-muted-foreground" },
};

function getInitials(username: string): string {
  return username.substring(0, 2).toUpperCase();
}

export function RecentActivitiesWidget({
  activities = [
    {
      id: "1",
      type: "login",
      user: "admin",
      description: "Inicio de sesión exitoso",
      timestamp: "Hace 2 min",
      details: "IP: 192.168.1.100",
    },
    {
      id: "2",
      type: "user_created",
      user: "admin",
      description: "Usuario 'jperez' creado",
      timestamp: "Hace 15 min",
      details: "Rol: Operador",
    },
    {
      id: "3",
      type: "role_assigned",
      user: "admin",
      description: "Rol 'Supervisor' asignado a 'mgarcia'",
      timestamp: "Hace 1h",
      details: "Permisos actualizados",
    },
    {
      id: "4",
      type: "logout",
      user: "jlopez",
      description: "Sesión cerrada",
      timestamp: "Hace 2h",
      details: "Sesión: 4h 23m",
    },
    {
      id: "5",
      type: "system_config",
      user: "admin",
      description: "Configuración de seguridad actualizada",
      timestamp: "Hace 3h",
      details: "Timeout de sesión modificado",
    },
  ],
  maxActivities = 8,
}: RecentActivitiesWidgetProps) {
  const displayActivities = activities.slice(0, maxActivities);

  return (
    <Card className="h-full rounded-2xl border">
      <CardHeader className="pb-3 px-6 pt-6">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Actividades Recientes
          </span>
          {activities.length > maxActivities && (
            <span className="text-xs text-muted-foreground">
              +{activities.length - maxActivities} más
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="px-6 pb-6">
        {displayActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
            <Activity className="h-10 w-10 opacity-30" />
            <p className="text-sm">No hay actividades recientes</p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[18px] top-2 bottom-8 w-px bg-border" />

            <div className="space-y-1">
              {displayActivities.map((activity) => {
                const cfg = activityConfig[activity.type];
                const Icon = cfg.icon;

                return (
                  <div
                    key={activity.id}
                    className="group relative flex items-start gap-4 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    {/* Timeline dot + icon */}
                    <div className="relative z-10 flex-shrink-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border bg-card shadow-sm">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <span
                        className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${cfg.dot}`}
                      />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-5 w-5 flex-shrink-0">
                            <AvatarFallback className="text-[10px] font-medium">
                              {getInitials(activity.user)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs font-semibold text-foreground truncate">
                            {activity.user}
                          </span>
                        </div>
                        <span className="flex-shrink-0 text-xs text-muted-foreground/70">
                          {activity.timestamp}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-foreground/80 leading-snug">
                        {activity.description}
                      </p>
                      {activity.details && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {activity.details}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <button className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
              Ver más actividades
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
