"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

interface ModernStatProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: number; isPositive: boolean };
  color?: "default" | "success" | "warning" | "danger";
  index?: number;
}

/** Animates a plain integer value from 0 → target */
function useCountUp(target: number, duration = 900) {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setCurrent(Math.round(target * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return current;
}

export function ModernStat({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = "default",
  index = 0,
}: ModernStatProps) {
  // Only count-up if value is a bare integer
  const numericValue =
    typeof value === "number" ? value : parseInt(String(value).replace(/\D/g, ""), 10);
  const isCountable = typeof value === "number" || /^\d+$/.test(String(value));
  const animated = useCountUp(isCountable ? numericValue : 0);

  const displayValue = isCountable
    ? animated.toLocaleString()
    : value;

  const colorConfig = {
    default: {
      icon: "bg-muted/60 text-muted-foreground",
      bar: "from-muted/30 to-muted/50",
      glow: "",
      blob: "bg-muted",
    },
    success: {
      icon: "bg-green-500/10 text-green-500",
      bar: "from-green-400 to-emerald-500",
      glow: "hover:shadow-green-500/10",
      blob: "bg-green-500",
    },
    warning: {
      icon: "bg-yellow-500/10 text-yellow-500",
      bar: "from-yellow-400 to-orange-400",
      glow: "hover:shadow-yellow-500/10",
      blob: "bg-yellow-500",
    },
    danger: {
      icon: "bg-red-500/10 text-red-500",
      bar: "from-red-400 to-rose-500",
      glow: "hover:shadow-red-500/10",
      blob: "bg-red-500",
    },
  };

  const cfg = colorConfig[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.09, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -5, scale: 1.025, transition: { duration: 0.2 } }}
    >
      <Card
        className={`relative overflow-hidden border-0 shadow-sm transition-shadow duration-300
          hover:shadow-xl ${cfg.glow} bg-gradient-to-br from-card to-card/80`}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <div className={`p-2 rounded-xl ${cfg.icon}`}>
            <Icon className="h-4 w-4" />
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex items-baseline space-x-2">
            <div className="text-2xl font-bold leading-none tabular-nums">
              {displayValue}
            </div>
            {trend && (
              <motion.div
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.09 + 0.35 }}
                className={`flex items-center gap-0.5 text-xs font-medium ${
                  trend.isPositive ? "text-green-500" : "text-red-500"
                }`}
              >
                {trend.isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                <span>{Math.abs(trend.value)}%</span>
              </motion.div>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {subtitle}
            </p>
          )}
        </CardContent>

        {/* Colored bottom bar */}
        <motion.div
          className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${cfg.bar}`}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.5, delay: index * 0.09 + 0.2, ease: "easeOut" }}
        />

        {/* Decorative background blob */}
        <div
          className={`absolute -right-5 -top-5 h-20 w-20 rounded-full opacity-5 blur-lg ${cfg.blob}`}
        />
      </Card>
    </motion.div>
  );
}
