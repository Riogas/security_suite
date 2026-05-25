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

  const firstPt = points.split(" ")[0];
  const lastX = pad + (series.length - 1) * stepX;
  const avg = Math.round(series.reduce((a, b) => a + b, 0) / series.length);

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
            <p className="text-xs text-muted-foreground">Promedio</p>
            <p className="text-sm font-semibold tabular-nums">{avg}</p>
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
              <linearGradient id="lineAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
              <filter id="lineGlow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Subtle grid lines */}
            {[0.25, 0.5, 0.75].map((frac) => {
              const y = height - pad - frac * (height - pad * 2);
              return (
                <line
                  key={frac}
                  x1={pad}
                  y1={y}
                  x2={width - pad}
                  y2={y}
                  strokeDasharray="3,3"
                  className="stroke-border/30"
                />
              );
            })}

            {/* Area fill */}
            <path
              d={`M ${firstPt} L ${points} L ${lastX},${height - pad} L ${pad},${height - pad} Z`}
              fill="url(#lineAreaGradient)"
            />

            {/* Main line */}
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              filter="url(#lineGlow)"
            />

            {/* Data dots */}
            {series.map((v, i) => {
              const x = pad + i * stepX;
              const y = height - pad - (v / max) * (height - pad * 2);
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r="4" fill="currentColor" className="cursor-pointer" />
                  <circle cx={x} cy={y} r="7" fill="currentColor" opacity="0" className="cursor-pointer hover:opacity-10 transition-opacity" />
                </g>
              );
            })}

            {/* Baseline */}
            <line
              x1={pad}
              y1={height - pad}
              x2={width - pad}
              y2={height - pad}
              strokeDasharray="2,4"
              className="stroke-border/40"
            />

            {/* Labels */}
            {labels.map((l, i) => (
              <text
                key={l + i}
                x={pad + i * stepX}
                y={height - 4}
                textAnchor="middle"
                fontSize="10"
                className="fill-muted-foreground"
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
