"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { useUser } from "@/hooks/useUser";
import { Button } from "@/components/ui/button";
import { UserPlus, Shield, FileText } from "lucide-react";
import Link from "next/link";

const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as [number, number, number, number];

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const quickActions = [
  {
    label: "Nuevo Usuario",
    icon: UserPlus,
    href: "/dashboard/usuarios/crear",
    variant: "default" as const,
  },
  {
    label: "Gestionar Roles",
    icon: Shield,
    href: "/dashboard/roles",
    variant: "outline" as const,
  },
  {
    label: "Ver Eventos",
    icon: FileText,
    href: "/dashboard/eventos",
    variant: "outline" as const,
  },
];

export function HeroGreeting() {
  const { user } = useUser();
  const shouldReduceMotion = useReducedMotion();

  const now = useMemo(() => new Date(), []);
  const greeting = getGreeting(now.getHours());
  const dateLabel = formatDate(now);
  const firstName = user?.nombre?.split(" ")[0] ?? "Usuario";

  const containerMotion: Partial<HTMLMotionProps<"div">> = shouldReduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: -16 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.45, ease: EASE_OUT_EXPO },
      };

  return (
    <motion.div
      {...containerMotion}
      className="relative overflow-hidden rounded-2xl border bg-card px-6 py-8"
    >
      {/* Decorative blobs — top right */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/5 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-20 top-8 h-24 w-24 rounded-full bg-primary/5 blur-2xl"
      />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Greeting text */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            {greeting},{" "}
            <span className="text-primary">{firstName}</span>
          </h1>
          <p className="mt-1 text-base capitalize text-muted-foreground">
            {dateLabel}
          </p>
        </div>

        {/* Quick actions — stacks below on mobile */}
        <div className="flex flex-wrap items-center gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.href}
                variant={action.variant}
                size="sm"
                asChild
                className="gap-1.5"
              >
                <Link href={action.href}>
                  <Icon className="h-4 w-4" />
                  {action.label}
                </Link>
              </Button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
