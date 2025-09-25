"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Shield, 
  Settings, 
  FileText, 
  UserPlus, 
  ShieldCheck,
  BarChart3,
  Download
} from "lucide-react";

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  variant: "default" | "outline" | "secondary";
  href: string;
  badge?: string;
  disabled?: boolean;
}

interface QuickActionsWidgetProps {
  actions?: QuickAction[];
}

export function QuickActionsWidget({ 
  actions = [
    {
      id: "1",
      title: "Crear Usuario",
      description: "Agregar nuevo usuario al sistema",
      icon: UserPlus,
      variant: "default",
      href: "/dashboard/usuarios/crear",
      badge: "Nuevo"
    },
    {
      id: "2",
      title: "Gestionar Roles",
      description: "Administrar roles y permisos",
      icon: Shield,
      variant: "outline",
      href: "/dashboard/roles"
    },
    {
      id: "3",
      title: "Ver Eventos",
      description: "Revisar logs del sistema",
      icon: FileText,
      variant: "outline",
      href: "/dashboard/eventos"
    },
    {
      id: "4",
      title: "Configuración",
      description: "Ajustes del sistema",
      icon: Settings,
      variant: "outline",
      href: "/dashboard/configuracion",
      disabled: true
    },
    {
      id: "5",
      title: "Reportes",
      description: "Generar reportes de seguridad",
      icon: BarChart3,
      variant: "secondary",
      href: "/dashboard/reportes"
    },
    {
      id: "6",
      title: "Exportar Datos",
      description: "Descargar información del sistema",
      icon: Download,
      variant: "secondary",
      href: "/dashboard/exportar"
    }
  ]
}: QuickActionsWidgetProps) {
  
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center space-x-2">
          <ShieldCheck className="w-5 h-5" />
          <span>Acciones Rápidas</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {actions.map((action) => {
            const Icon = action.icon;
            
            return (
              <Button
                key={action.id}
                variant={action.variant}
                className="h-auto p-4 justify-start space-x-3 relative group transition-all hover:scale-[1.02]"
                disabled={action.disabled}
                asChild={!action.disabled}
              >
                {action.disabled ? (
                  <div className="flex items-start space-x-3 w-full opacity-50">
                    <Icon className="w-5 h-5 mt-1 flex-shrink-0" />
                    <div className="text-left flex-1">
                      <div className="font-medium text-sm">{action.title}</div>
                      <div className="text-xs opacity-70 mt-0.5">{action.description}</div>
                      {action.badge && (
                        <Badge variant="outline" className="mt-2 text-xs">
                          {action.badge}
                        </Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <a href={action.href} className="flex items-start space-x-3 w-full">
                    <Icon className="w-5 h-5 mt-1 flex-shrink-0" />
                    <div className="text-left flex-1">
                      <div className="font-medium text-sm">{action.title}</div>
                      <div className="text-xs opacity-70 mt-0.5">{action.description}</div>
                      {action.badge && (
                        <Badge variant="outline" className="mt-2 text-xs">
                          {action.badge}
                        </Badge>
                      )}
                    </div>
                  </a>
                )}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}