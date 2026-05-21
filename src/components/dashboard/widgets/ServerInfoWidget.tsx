"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Server,
  Database,
  Wifi,
  Clock,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";

interface ServerInfoWidgetProps {
  serverName?: string;
  uptime?: string;
  status?: "online" | "maintenance" | "offline";
  version?: string;
  lastBackup?: string;
}

const statusConfig = {
  online:      { icon: CheckCircle,  dot: "bg-success",     text: "text-success",     label: "En Línea" },
  maintenance: { icon: AlertTriangle, dot: "bg-warning",    text: "text-warning",     label: "Mantenimiento" },
  offline:     { icon: AlertTriangle, dot: "bg-destructive",text: "text-destructive", label: "Fuera de Línea" },
};

interface InfoRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}

function InfoRow({ icon: Icon, label, value, mono }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className={`text-sm font-semibold ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

interface ConnectionRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  connected: boolean;
}

function ConnectionRow({ icon: Icon, label, connected }: ConnectionRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm">{label}</span>
      </div>
      <span className={`flex items-center gap-1.5 text-xs font-medium ${connected ? "text-success" : "text-destructive"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-success" : "bg-destructive"}`} />
        {connected ? "Activo" : "Inactivo"}
      </span>
    </div>
  );
}

export function ServerInfoWidget({
  serverName = "SEC-SRV-01",
  uptime = "15d 7h 23m",
  status = "online",
  version = "v2.1.4",
  lastBackup = "Hace 2 horas",
}: ServerInfoWidgetProps) {
  const cfg = statusConfig[status];
  const StatusIcon = cfg.icon;

  return (
    <Card className="h-full rounded-2xl border">
      <CardHeader className="pb-3 px-6 pt-6">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Server className="h-4 w-4 text-muted-foreground" />
            Info del Servidor
          </span>
          <span className={`flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            {cfg.label}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="px-6 pb-6 space-y-4">
        {/* Details */}
        <div className="space-y-2">
          <InfoRow icon={Server}   label="Servidor"       value={serverName} mono />
          <InfoRow icon={Clock}    label="Tiempo activo"  value={uptime}     mono />
          <InfoRow icon={Database} label="Versión"        value={version}    mono />
          <InfoRow icon={Database} label="Último backup"  value={lastBackup} />
        </div>

        {/* Connections */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Conexiones
          </p>
          <div className="space-y-2">
            <ConnectionRow icon={Database} label="Base de Datos" connected />
            <ConnectionRow icon={Wifi}     label="Red Externa"   connected />
            <ConnectionRow icon={Server}   label="API Externa"   connected />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
