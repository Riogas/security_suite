"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ShieldCheck,
  UserPlus,
  Shield,
  FileText,
  Settings,
  BarChart3,
  Download,
} from "lucide-react";
import Link from "next/link";

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
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
      description: "Agregar nuevo usuario",
      icon: UserPlus,
      href: "/dashboard/usuarios/crear",
    },
    {
      id: "2",
      title: "Gestionar Roles",
      description: "Roles y permisos",
      icon: Shield,
      href: "/dashboard/roles",
    },
    {
      id: "3",
      title: "Ver Eventos",
      description: "Logs del sistema",
      icon: FileText,
      href: "/dashboard/eventos",
    },
    {
      id: "4",
      title: "Configuración",
      description: "Ajustes generales",
      icon: Settings,
      href: "/dashboard/configuracion",
      disabled: true,
    },
    {
      id: "5",
      title: "Reportes",
      description: "Seguridad y accesos",
      icon: BarChart3,
      href: "/dashboard/reportes",
    },
    {
      id: "6",
      title: "Exportar",
      description: "Descargar datos",
      icon: Download,
      href: "/dashboard/exportar",
    },
  ],
}: QuickActionsWidgetProps) {
  return (
    <Card className="h-full rounded-2xl border">
      <CardHeader className="pb-3 px-6 pt-6">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          Acciones Rápidas
        </CardTitle>
      </CardHeader>

      <CardContent className="px-6 pb-6">
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => {
            const Icon = action.icon;

            const inner = (
              <div className="flex flex-col items-start gap-2 p-3 w-full">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium leading-tight">{action.title}</p>
                  <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                    {action.description}
                  </p>
                </div>
              </div>
            );

            if (action.disabled) {
              return (
                <div
                  key={action.id}
                  className="rounded-xl border bg-muted/20 opacity-50 cursor-not-allowed"
                >
                  {inner}
                </div>
              );
            }

            return (
              <Link
                key={action.id}
                href={action.href}
                className="rounded-xl border bg-card transition-all hover:bg-muted/40 hover:shadow-sm hover:-translate-y-0.5 duration-150"
              >
                {inner}
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
