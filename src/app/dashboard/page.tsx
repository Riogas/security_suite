"use client";

import { HeroGreeting } from "@/components/dashboard/widgets/HeroGreeting";
import { KpiCard } from "@/components/dashboard/stats/KpiCard";
import { EnhancedBarChart } from "@/components/dashboard/charts/EnhancedBarChart";
import { EnhancedLineChart } from "@/components/dashboard/charts/EnhancedLineChart";
import { AlertsWidget } from "@/components/dashboard/widgets/AlertsWidget";
import { QuickActionsWidget } from "@/components/dashboard/widgets/QuickActionsWidget";
import { SystemStatusWidget } from "@/components/dashboard/widgets/SystemStatusWidget";
import { RecentActivitiesWidget } from "@/components/dashboard/widgets/RecentActivitiesWidget";
import { ServerInfoWidget } from "@/components/dashboard/widgets/ServerInfoWidget";
import { Users, LogIn, AlertTriangle, Activity } from "lucide-react";

export default function DashboardPage() {
  const kpis = [
    {
      title: "Usuarios Activos",
      value: "142",
      subtitle: "Total registrados en el sistema",
      trend: { value: 12, isPositive: true },
      icon: Users,
      accent: "primary" as const,
    },
    {
      title: "Accesos Hoy",
      value: "1284",
      subtitle: "+8% respecto a ayer",
      trend: { value: 8, isPositive: true },
      icon: LogIn,
      accent: "success" as const,
    },
    {
      title: "Alertas Pendientes",
      value: "3",
      subtitle: "2 menos que ayer",
      trend: { value: 40, isPositive: false },
      icon: AlertTriangle,
      accent: "warning" as const,
    },
    {
      title: "Uptime Sistema",
      value: "99.9%",
      subtitle: "Últimos 30 días",
      icon: Activity,
      accent: "info" as const,
    },
  ];

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
  const lineChartLabels = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "24:00"];

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4 md:space-y-6">

      {/* Row 1 — Hero (full width) */}
      <div>
        <HeroGreeting />
      </div>

      {/* Row 2 — KPI Cards (4 columns on desktop) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <KpiCard key={kpi.title} {...kpi} index={i} />
        ))}
      </div>

      {/* Row 3 — Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <EnhancedBarChart
          data={barChartData}
          title="Accesos por Día"
          description="Actividad de los últimos 7 días"
        />
        <EnhancedLineChart
          series={lineChartSeries}
          labels={lineChartLabels}
          title="Actividad por Hora"
          description="Patrones de uso durante el día de hoy"
        />
      </div>

      {/* Row 4 — Bento: Activities (wide) + Alerts (narrow) */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <RecentActivitiesWidget />
        </div>
        <div className="lg:col-span-4">
          <AlertsWidget />
        </div>
      </div>

      {/* Row 5 — System Status + Server Info + Quick Actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SystemStatusWidget />
        <ServerInfoWidget />
        <QuickActionsWidget />
      </div>
    </div>
  );
}
