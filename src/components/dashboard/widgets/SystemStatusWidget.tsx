"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Server,
  Database,
  Wifi,
  HardDrive,
  Cpu,
  MemoryStick,
  Activity,
} from "lucide-react";

interface SystemMetric {
  id: string;
  name: string;
  value: number;
  maxValue: number;
  unit: string;
  status: "good" | "warning" | "critical";
  icon: React.ComponentType<{ className?: string }>;
}

interface SystemStatusWidgetProps {
  metrics?: SystemMetric[];
  serverName?: string;
  uptime?: string;
}

const statusDot: Record<SystemMetric["status"], string> = {
  good: "bg-success",
  warning: "bg-warning",
  critical: "bg-destructive",
};

const statusLabel: Record<SystemMetric["status"], string> = {
  good: "Normal",
  warning: "Alerta",
  critical: "Crítico",
};

const statusText: Record<SystemMetric["status"], string> = {
  good: "text-success",
  warning: "text-warning",
  critical: "text-destructive",
};

export function SystemStatusWidget({
  metrics = [
    { id: "cpu",    name: "CPU",     value: 45, maxValue: 100, unit: "%",    status: "good",     icon: Cpu },
    { id: "memory", name: "Memoria", value: 68, maxValue: 100, unit: "%",    status: "warning",  icon: MemoryStick },
    { id: "disk",   name: "Disco",   value: 82, maxValue: 100, unit: "%",    status: "critical", icon: HardDrive },
    { id: "network",name: "Red",     value: 25, maxValue: 100, unit: "Mbps", status: "good",     icon: Wifi },
  ],
  serverName = "SEC-SRV-01",
  uptime = "15d 7h 23m",
}: SystemStatusWidgetProps) {
  const overallStatus = metrics.some((m) => m.status === "critical")
    ? "critical"
    : metrics.some((m) => m.status === "warning")
      ? "warning"
      : "good";

  return (
    <Card className="h-full rounded-2xl border">
      <CardHeader className="pb-3 px-6 pt-6">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Server className="h-4 w-4 text-muted-foreground" />
            Estado del Sistema
          </span>
          <span className={`flex items-center gap-1.5 text-xs font-medium ${statusText[overallStatus]}`}>
            <span className={`h-2 w-2 rounded-full ${statusDot[overallStatus]}`} />
            {statusLabel[overallStatus]}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="px-6 pb-6 space-y-4">
        {/* Server info row */}
        <div className="flex items-center justify-between rounded-xl bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{serverName}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            <span className="font-mono">{uptime}</span>
          </div>
        </div>

        {/* Metrics */}
        <div className="space-y-3">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            const pct = Math.round((metric.value / metric.maxValue) * 100);

            return (
              <div key={metric.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{metric.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-semibold ${statusText[metric.status]}`}>
                      {metric.value}{metric.unit}
                    </span>
                    <span className={`h-1.5 w-1.5 rounded-full ${statusDot[metric.status]}`} />
                  </div>
                </div>
                <Progress value={pct} className="h-1.5" />
              </div>
            );
          })}
        </div>

        {/* DB status */}
        <div className="flex items-center justify-between rounded-xl bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Base de Datos</span>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Conectado
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
