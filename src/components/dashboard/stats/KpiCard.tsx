"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: number; isPositive: boolean };
  accent?: "primary" | "success" | "warning" | "info";
  index?: number;
}

function useCountUp(target: number, duration = 900, skip = false) {
  const [current, setCurrent] = useState(skip ? target : 0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (skip) {
      setCurrent(target);
      return;
    }
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCurrent(Math.round(target * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, skip]);

  return current;
}

const accentConfig = {
  primary: {
    icon: "text-primary opacity-10",
    trend: { positive: "text-success", negative: "text-destructive" },
    dot: "bg-primary",
  },
  success: {
    icon: "text-success opacity-10",
    trend: { positive: "text-success", negative: "text-destructive" },
    dot: "bg-success",
  },
  warning: {
    icon: "text-warning opacity-10",
    trend: { positive: "text-success", negative: "text-destructive" },
    dot: "bg-warning",
  },
  info: {
    icon: "text-chart-2 opacity-10",
    trend: { positive: "text-success", negative: "text-destructive" },
    dot: "bg-chart-2",
  },
};

// cubic-bezier as a proper tuple for framer-motion
const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as [number, number, number, number];

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  accent = "primary",
  index = 0,
}: KpiCardProps) {
  const shouldReduceMotion = useReducedMotion();

  const numericValue =
    typeof value === "number"
      ? value
      : parseInt(String(value).replace(/[^0-9]/g, ""), 10);
  const isCountable =
    typeof value === "number" || /^\d+$/.test(String(value));
  const animated = useCountUp(
    isCountable ? numericValue : 0,
    900,
    !!shouldReduceMotion
  );

  const displayValue = isCountable ? animated.toLocaleString("es-UY") : value;

  const cfg = accentConfig[accent];

  const motionProps: Partial<HTMLMotionProps<"div">> = shouldReduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 24 },
        animate: { opacity: 1, y: 0 },
        transition: {
          duration: 0.4,
          delay: index * 0.05,
          ease: EASE_OUT_EXPO,
        },
        whileHover: { y: -2, transition: { duration: 0.15 } },
      };

  return (
    <motion.div {...motionProps}>
      <Card className="relative overflow-hidden border rounded-2xl p-6 bg-card hover:shadow-lg transition-all duration-200 cursor-default">
        {/* Decorative icon — large, top-right, very faint */}
        <div className="absolute -right-3 -top-3 pointer-events-none">
          <Icon className={`h-20 w-20 ${cfg.icon}`} />
        </div>

        {/* Label */}
        <p className="text-xs uppercase tracking-wider font-medium text-muted-foreground mb-3">
          {title}
        </p>

        {/* Value */}
        <div className="flex items-baseline gap-2">
          <span className="text-4xl md:text-5xl font-bold tracking-tight tabular-nums leading-none">
            {displayValue}
          </span>

          {trend && (
            <span
              className={`flex items-center gap-0.5 text-xs font-semibold ${
                trend.isPositive ? cfg.trend.positive : cfg.trend.negative
              }`}
            >
              {trend.isPositive ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              {Math.abs(trend.value)}%
            </span>
          )}
        </div>

        {/* Subtitle */}
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            {subtitle}
          </p>
        )}

        {/* Bottom accent line */}
        <motion.div
          className={`absolute bottom-0 left-0 right-0 h-0.5 ${cfg.dot}`}
          initial={shouldReduceMotion ? undefined : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.5, delay: index * 0.05 + 0.2, ease: "easeOut" }}
          style={{ transformOrigin: "left" }}
        />
      </Card>
    </motion.div>
  );
}
