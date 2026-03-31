"use client";

import { DashboardHeader } from "@/components/dashboard/widgets/DashboardHeader";
import { ModernStat } from "@/components/dashboard/stats/ModernStat";
import { EnhancedBarChart } from "@/components/dashboard/charts/EnhancedBarChart";
import { EnhancedLineChart } from "@/components/dashboard/charts/EnhancedLineChart";
import { AlertsWidget } from "@/components/dashboard/widgets/AlertsWidget";
import { QuickActionsWidget } from "@/components/dashboard/widgets/QuickActionsWidget";
import { SystemStatusWidget } from "@/components/dashboard/widgets/SystemStatusWidget";
import { RecentActivitiesWidget } from "@/components/dashboard/widgets/RecentActivitiesWidget";
import { ServerInfoWidget } from "@/components/dashboard/widgets/ServerInfoWidget";
import { Users, LogIn, AlertTriangle, Activity } from "lucide-react";

export default function DashboardPage() {
  // Datos de ejemplo para las estadísticas
  const statsData = [
    {
      title: "Usuarios Activos",
      value: "142",
      subtitle: "+12% desde el mes pasado",
      trend: { value: 12, isPositive: true },
      icon: Users,
      color: "default" as const,
    },
    {
      title: "Accesos Hoy",
      value: "1,284",
      subtitle: "+8% desde ayer",
      trend: { value: 8, isPositive: true },
      icon: LogIn,
      color: "success" as const,
    },
    {
      title: "Alertas Pendientes",
      value: "3",
      subtitle: "-2 desde ayer",
      trend: { value: 2, isPositive: false },
      icon: AlertTriangle,
      color: "warning" as const,
    },
    {
      title: "Uptime Sistema",
      value: "99.9%",
      subtitle: "Últimos 30 días",
      icon: Activity,
      color: "success" as const,
    },
  ];

  // Datos para gráficas
  const barChartData = [
    { label: "Lun", value: 180 },
    { label: "Mar", value: 220 },
    { label: "Mié", value: 190 },
    { label: "Jue", value: 280 },
    { label: "Vie", value: 320 },
    { label: "Sáb", value: 150 },
    { label: "Dom", value: 120 },
  ];

  const lineChartSeries = [45, 30, 85, 120, 95, 70, 55];
  const lineChartLabels = [
    "00:00",
    "04:00",
    "08:00",
    "12:00",
    "16:00",
    "20:00",
    "24:00",
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <DashboardHeader systemStatus="active" lastUpdated="2 min" />

      {/* Estadísticas principales */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statsData.map((stat, index) => (
          <ModernStat key={index} {...stat} index={index} />
        ))}
      </div>

      {/* Gráficas principales */}
      <div className="grid gap-6 lg:grid-cols-2">
        <EnhancedBarChart
          data={barChartData}
          title="Accesos por Día"
          description="Actividad de accesos en los últimos 7 días"
        />
        <EnhancedLineChart
          series={lineChartSeries}
          labels={lineChartLabels}
          title="Actividad por Hora"
          description="Patrones de uso durante el día de hoy"
        />
      </div>

      {/* Widgets de información */}
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
        <div className="lg:col-span-1">
          <AlertsWidget />
        </div>
        <div className="lg:col-span-1">
          <RecentActivitiesWidget />
        </div>
        <div className="lg:col-span-1">
          <SystemStatusWidget />
        </div>
        <div className="lg:col-span-1">
          <ServerInfoWidget />
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="grid gap-6">
        <QuickActionsWidget />
      </div>
    </div>
  );
}
