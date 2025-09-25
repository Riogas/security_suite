"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

interface ModernStatProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: number; isPositive: boolean };
  color?: "default" | "success" | "warning" | "danger";
}

export function ModernStat({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend, 
  color = "default" 
}: ModernStatProps) {
  const colorClasses = {
    default: "text-muted-foreground",
    success: "text-green-600",
    warning: "text-yellow-600", 
    danger: "text-red-600"
  };

  return (
    <Card className="relative overflow-hidden transition-all duration-200 hover:shadow-md border-0 shadow-sm bg-gradient-to-br from-card to-card/80">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${colorClasses[color]}`} />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline space-x-2">
          <div className="text-2xl font-bold leading-none">{value}</div>
          {trend && (
            <div className={`flex items-center text-xs ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {trend.isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              <span className="ml-1">{Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>
        {subtitle && <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{subtitle}</div>}
      </CardContent>
      <div className={`absolute bottom-0 left-0 right-0 h-1 ${
        color === 'success' ? 'bg-gradient-to-r from-green-400 to-green-600' : 
        color === 'warning' ? 'bg-gradient-to-r from-yellow-400 to-yellow-600' : 
        color === 'danger' ? 'bg-gradient-to-r from-red-400 to-red-600' : 'bg-gradient-to-r from-muted/20 to-muted/40'
      }`} />
    </Card>
  );
}