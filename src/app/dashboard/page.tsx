// src/app/dashboard/page.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Pequeños componentes de visualización (sin librerías externas)
function MiniStat({ title, value, subtitle }: { title: string; value: string | number; subtitle?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold leading-none">{value}</div>
        {subtitle ? <div className="text-xs text-muted-foreground mt-1">{subtitle}</div> : null}
      </CardContent>
    </Card>
  );
}

function BarChart({ title, data }: { title: string; data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barWidth = 28;
  const gap = 16;
  const width = data.length * (barWidth + gap) + gap;
  const height = 160;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg width={width} height={height} className="text-primary">
            {data.map((d, i) => {
              const h = Math.round((d.value / max) * (height - 24));
              const x = gap + i * (barWidth + gap);
              const y = height - h - 16;
              return (
                <g key={d.label}>
                  <rect x={x} y={y} width={barWidth} height={h} rx={4} className="fill-current opacity-80" />
                  <text x={x + barWidth / 2} y={height - 4} textAnchor="middle" className="fill-foreground text-[10px]">
                    {d.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

function LineChart({ title, series, labels }: { title: string; series: number[]; labels: string[] }) {
  const w = 420;
  const h = 160;
  const pad = 16;
  const max = Math.max(1, ...series);
  const stepX = (w - pad * 2) / Math.max(1, series.length - 1);
  const points = series
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = h - pad - (v / max) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg width={w} height={h} className="text-primary">
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Baseline */}
            <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} className="stroke-muted-foreground/30" />
            {/* Labels */}
            {labels.map((l, i) => (
              <text
                key={l + i}
                x={pad + i * stepX}
                y={h - 2}
                textAnchor="middle"
                className="fill-foreground text-[10px]"
              >
                {l}
              </text>
            ))}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  // Datos simulados (conecta a tu API cuando estén disponibles)
  const stats = [
    { title: "Usuarios", value: 245 },
    { title: "Usuarios Activos", value: 198 },
    { title: "Roles", value: 32 },
    { title: "Permisos", value: 476 },
    { title: "Objetos", value: 154 },
    { title: "Aplicaciones", value: 4 },
    { title: "Sesiones Activas", value: 21 },
    { title: "Intentos Fallidos (24h)", value: 17 },
  ];

  const permisosPorApp = [
    { label: "SEC", value: 210 },
    { label: "SGM", value: 120 },
    { label: "GOYA", value: 92 },
    { label: "SYS", value: 54 },
  ];

  const accesosDiarios = [14, 22, 19, 31, 28, 35, 27];
  const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Seguridad y Accesos</h1>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.slice(0, 8).map((s) => (
          <MiniStat key={s.title} title={s.title} value={s.value} />
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LineChart title="Accesos por día (últimos 7)" series={accesosDiarios} labels={dias} />
        <BarChart title="Permisos por aplicación" data={permisosPorApp} />
      </div>

      {/* Otras métricas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MiniStat title="Usuarios sin rol" value={12} subtitle="Revisar asignaciones pendientes" />
        <MiniStat title="Permisos obsoletos" value={8} subtitle="Considerar limpieza" />
        <MiniStat title="Objetos sin relación" value={5} subtitle="Requiere vinculación" />
      </div>
    </div>
  );
}
