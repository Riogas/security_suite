"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface BarChartData {
  label: string;
  value: number;
  color?: string;
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
  height = 180 
}: EnhancedBarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barWidth = 32;
  const gap = 20;
  const width = data.length * (barWidth + gap) + gap;
  
  return (
    <Card className="transition-all duration-200 hover:shadow-md border-0 shadow-sm bg-gradient-to-br from-card to-card/80">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">{title}</CardTitle>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
          <Badge variant="outline" className="text-xs bg-muted/30">
            Total: {data.reduce((acc, d) => acc + d.value, 0)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg width={width} height={height} className="text-primary">
            <defs>
              <linearGradient id="barGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.8"/>
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.4"/>
              </linearGradient>
            </defs>
            {data.map((d, i) => {
              const h = Math.round((d.value / max) * (height - 40));
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
                    y={y - 8} 
                    textAnchor="middle" 
                    className="fill-foreground text-xs font-medium"
                  >
                    {d.value}
                  </text>
                  <text 
                    x={x + barWidth / 2} 
                    y={height - 4} 
                    textAnchor="middle" 
                    className="fill-muted-foreground text-[10px] font-medium"
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