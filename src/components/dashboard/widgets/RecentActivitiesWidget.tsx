"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Activity,
  User,
  Shield,
  Settings,
  LogIn,
  LogOut,
  UserPlus,
  Trash2,
  Edit,
  Clock
} from "lucide-react";

interface RecentActivity {
  id: string;
  type: "login" | "logout" | "user_created" | "user_updated" | "user_deleted" | "role_assigned" | "permission_changed" | "system_config";
  user: string;
  description: string;
  timestamp: string;
  details?: string;
}

interface RecentActivitiesWidgetProps {
  activities?: RecentActivity[];
  maxActivities?: number;
}

export function RecentActivitiesWidget({ 
  activities = [
    {
      id: "1",
      type: "login",
      user: "admin",
      description: "Inicio de sesión exitoso",
      timestamp: "Hace 2 minutos",
      details: "IP: 192.168.1.100"
    },
    {
      id: "2", 
      type: "user_created",
      user: "admin",
      description: "Usuario 'jperez' creado",
      timestamp: "Hace 15 minutos",
      details: "Rol: Operador"
    },
    {
      id: "3",
      type: "role_assigned",
      user: "admin",
      description: "Rol 'Supervisor' asignado a 'mgarcia'",
      timestamp: "Hace 1 hora",
      details: "Permisos actualizados"
    },
    {
      id: "4",
      type: "logout",
      user: "jlopez",
      description: "Sesión cerrada",
      timestamp: "Hace 2 horas",
      details: "Tiempo de sesión: 4h 23m"
    },
    {
      id: "5",
      type: "system_config",
      user: "admin",
      description: "Configuración de seguridad actualizada",
      timestamp: "Hace 3 horas",
      details: "Timeout de sesión modificado"
    }
  ],
  maxActivities = 10
}: RecentActivitiesWidgetProps) {

  const getActivityConfig = (type: RecentActivity["type"]) => {
    const configs = {
      login: {
        icon: LogIn,
        color: "text-green-600",
        bgColor: "bg-green-50",
        borderColor: "border-green-200"
      },
      logout: {
        icon: LogOut,
        color: "text-blue-600",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-200"
      },
      user_created: {
        icon: UserPlus,
        color: "text-purple-600",
        bgColor: "bg-purple-50",
        borderColor: "border-purple-200"
      },
      user_updated: {
        icon: Edit,
        color: "text-orange-600",
        bgColor: "bg-orange-50",
        borderColor: "border-orange-200"
      },
      user_deleted: {
        icon: Trash2,
        color: "text-red-600",
        bgColor: "bg-red-50",
        borderColor: "border-red-200"
      },
      role_assigned: {
        icon: Shield,
        color: "text-indigo-600",
        bgColor: "bg-indigo-50",
        borderColor: "border-indigo-200"
      },
      permission_changed: {
        icon: Settings,
        color: "text-yellow-600",
        bgColor: "bg-yellow-50",
        borderColor: "border-yellow-200"
      },
      system_config: {
        icon: Settings,
        color: "text-gray-600",
        bgColor: "bg-gray-50",
        borderColor: "border-gray-200"
      }
    };
    return configs[type];
  };

  const getInitials = (username: string) => {
    return username.substring(0, 2).toUpperCase();
  };

  const displayActivities = activities.slice(0, maxActivities);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5" />
            <span>Actividades Recientes</span>
          </div>
          {activities.length > maxActivities && (
            <Badge variant="outline" className="text-xs">
              +{activities.length - maxActivities} más
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {displayActivities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No hay actividades recientes</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayActivities.map((activity, index) => {
              const config = getActivityConfig(activity.type);
              const Icon = config.icon;
              
              return (
                <div
                  key={activity.id}
                  className={`flex items-start space-x-3 p-3 rounded-lg border transition-all hover:shadow-sm ${config.bgColor} ${config.borderColor}`}
                >
                  <div className={`p-2 rounded-full ${config.bgColor} border ${config.borderColor}`}>
                    <Icon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-2">
                        <Avatar className="w-6 h-6">
                          <AvatarFallback className="text-xs">
                            {getInitials(activity.user)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{activity.user}</span>
                      </div>
                      <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{activity.timestamp}</span>
                      </div>
                    </div>
                    
                    <p className="text-sm text-foreground mb-1">{activity.description}</p>
                    
                    {activity.details && (
                      <p className="text-xs text-muted-foreground">{activity.details}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}