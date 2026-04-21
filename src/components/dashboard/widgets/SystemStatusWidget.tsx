"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Monitor,
  Database,
  Wifi,
  HardDrive,
  Cpu,
  MemoryStick,
  Server,
  Activity,
} from "lucide-react";

interface SystemMetric {
  id: string;
  name: string;
  value: number;
  maxValue: number;
  unit: string;
  status: "good" | "warning" | "critical";
  icon: React.ComponentType<any>;
}

interface SystemStatusWidgetProps {
  metrics?: SystemMetric[];
  serverName?: string;
  uptime?: string;
}

export function SystemStatusWidget({
  metrics = [
    {
      id: "cpu",
      name: "CPU",
      value: 45,
      maxValue: 100,
      unit: "%",
      status: "good",
      icon: Cpu,
    },
    {
      id: "memory",
      name: "Memoria",
      value: 68,
      maxValue: 100,
      unit: "%",
      status: "warning",
      icon: MemoryStick,
    },
    {
      id: "disk",
      name: "Disco",
      value: 82,
      maxValue: 100,
      unit: "%",
      status: "critical",
      icon: HardDrive,
    },
    {
      id: "network",
      name: "Red",
      value: 25,
      maxValue: 100,
      unit: "Mbps",
      status: "good",
      icon: Wifi,
    },
  ],
  serverName = "SEC-SRV-01",
  uptime = "15d 7h 23m",
}: SystemStatusWidgetProps) {
  const getStatusColor = (status: SystemMetric["status"]) => {
    const colors = {
      good: "text-green-600",
      warning: "text-yellow-600",
      critical: "text-red-600",
    };
    return colors[status];
  };

  const getProgressColor = (status: SystemMetric["status"]) => {
    const colors = {
      good: "bg-green-500",
      warning: "bg-yellow-500",
      critical: "bg-red-500",
    };
    return colors[status];
  };

  const getStatusBadge = (status: SystemMetric["status"]) => {
    const badges = {
      good: { text: "Normal", class: "bg-green-100 text-green-700" },
      warning: { text: "Alerta", class: "bg-yellow-100 text-yellow-700" },
      critical: { text: "Crítico", class: "bg-red-100 text-red-700" },
    };
    return badges[status];
  };

  const overallStatus = metrics.some((m) => m.status === "critical")
    ? "critical"
    : metrics.some((m) => m.status === "warning")
      ? "warning"
      : "good";

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Server className="w-5 h-5" />
            <span>Estado del Sistema</span>
          </div>
          <Badge
            variant="outline"
            className={getStatusBadge(overallStatus).class}
          >
            {getStatusBadge(overallStatus).text}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Server Info */}
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center space-x-2">
            <Monitor className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{serverName}</span>
          </div>
          <div className="flex items-center space-x-1 text-sm text-muted-foreground">
            <Activity className="w-4 h-4" />
            <span>{uptime}</span>
          </div>
        </div>

        {/* Metrics */}
        <div className="space-y-3">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            const percentage = (metric.value / metric.maxValue) * 100;

            return (
              <div key={metric.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{metric.name}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-sm font-mono ${getStatusColor(metric.status)}`}
                    >
                      {metric.value}
                      {metric.unit}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${getStatusBadge(metric.status).class}`}
                    >
                      {getStatusBadge(metric.status).text}
                    </Badge>
                  </div>
                </div>
                <div className="relative">
                  <Progress value={percentage} className="h-2" />
                  <div
                    className={`absolute top-0 left-0 h-2 rounded-full transition-all ${getProgressColor(metric.status)}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Database Status */}
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Base de Datos</span>
          </div>
          <Badge variant="outline" className="bg-green-100 text-green-700">
            Conectado
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
