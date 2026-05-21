"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BarChartData {
  label: string;
  value: number;
}

interface EnhancedBarChartProps {
  title: string;
  data: BarChartData[];
  description?: string;
  height?: number;
}

export function EnhancedBarChart({
  title,
  data,
  description,
  height = 180,
}: EnhancedBarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barWidth = 32;
  const gap = 20;
  const width = data.length * (barWidth + gap) + gap;
  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <Card className="rounded-2xl border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
      <CardHeader className="px-6 pt-6 pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-sm font-semibold tabular-nums">{total.toLocaleString("es-UY")}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-6 pb-6">
        <div className="overflow-x-auto">
          <svg
            width={width}
            height={height}
            className="text-primary"
            aria-label={title}
          >
            <defs>
              <linearGradient id="barGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.85" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.35" />
              </linearGradient>
            </defs>

            {/* Subtle grid lines */}
            {[0.25, 0.5, 0.75].map((frac) => {
              const y = height - 20 - frac * (height - 40);
              return (
                <line
                  key={frac}
                  x1={gap / 2}
                  y1={y}
                  x2={width - gap / 2}
                  y2={y}
                  strokeDasharray="3,3"
                  className="stroke-border/40"
                />
              );
            })}

            {data.map((d, i) => {
              const h = Math.max(4, Math.round((d.value / max) * (height - 40)));
              const x = gap + i * (barWidth + gap);
              const y = height - h - 20;
              return (
                <g key={d.label}>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={h}
                    rx={6}
                    fill="url(#barGradient)"
                    className="hover:opacity-80 transition-opacity cursor-pointer"
                  />
                  <text
                    x={x + barWidth / 2}
                    y={y - 6}
                    textAnchor="middle"
                    fontSize="10"
                    className="fill-foreground font-medium"
                  >
                    {d.value}
                  </text>
                  <text
                    x={x + barWidth / 2}
                    y={height - 5}
                    textAnchor="middle"
                    fontSize="10"
                    className="fill-muted-foreground"
                  >
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
