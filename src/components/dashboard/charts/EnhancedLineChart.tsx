"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EnhancedLineChartProps {
  title: string;
  series: number[];
  labels: string[];
  description?: string;
  width?: number;
  height?: number;
}

export function EnhancedLineChart({
  title,
  series,
  labels,
  description,
  width = 440,
  height = 180,
}: EnhancedLineChartProps) {
  const pad = 20;
  const max = Math.max(1, ...series);
  const stepX = (width - pad * 2) / Math.max(1, series.length - 1);
  const points = series
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = height - pad - (v / max) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const avg = series.reduce((a, b) => a + b, 0) / series.length;

  return (
    <Card className="transition-all duration-200 hover:shadow-md border-0 shadow-sm bg-gradient-to-br from-card to-card/80">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">{title}</CardTitle>
            {description && (
              <p className="text-sm text-muted-foreground mt-1">
                {description}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Promedio</div>
            <div className="text-sm font-medium">{Math.round(avg)}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg width={width} height={height} className="text-primary">
            <defs>
              <linearGradient
                id="lineGradient"
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Área bajo la curva */}
            <path
              d={`M ${points.split(" ")[0]} L ${points} L ${pad + (series.length - 1) * stepX},${height - pad} L ${pad},${height - pad} Z`}
              fill="url(#lineGradient)"
            />

            {/* Línea principal */}
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              filter="url(#glow)"
              className="drop-shadow-sm"
            />

            {/* Puntos de datos */}
            {series.map((v, i) => {
              const x = pad + i * stepX;
              const y = height - pad - (v / max) * (height - pad * 2);
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r="4"
                  fill="currentColor"
                  className="drop-shadow-sm cursor-pointer hover:r-5 transition-all"
                />
              );
            })}

            {/* Línea base */}
            <line
              x1={pad}
              y1={height - pad}
              x2={width - pad}
              y2={height - pad}
              className="stroke-muted-foreground/20"
              strokeDasharray="2,2"
            />

            {/* Labels */}
            {labels.map((l, i) => (
              <text
                key={l + i}
                x={pad + i * stepX}
                y={height - 2}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] font-medium"
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
