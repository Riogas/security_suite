import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export interface PageHeaderStat {
  label: string;
  value: string | number;
  tone?: "default" | "muted" | "success";
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Ícono opcional, renderizado en un contenedor con gradiente */
  icon?: LucideIcon;
  stats?: PageHeaderStat[];
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  stats,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-muted/30 p-6 mb-6",
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      {/* Acento decorativo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/10 blur-3xl"
      />

      {/* Left: icon + title + description + stats */}
      <div className="relative min-w-0 flex-1">
        <div className="flex items-start gap-4">
          {Icon && (
            <div
              aria-hidden="true"
              className="shrink-0 size-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/15"
            >
              <Icon className="size-6" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
              {stats && stats.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {stats.map((stat, i) => (
                    <Badge
                      key={i}
                      variant={
                        stat.tone === "success"
                          ? "success"
                          : stat.tone === "muted"
                            ? "secondary"
                            : "outline"
                      }
                      className="text-xs font-normal"
                    >
                      {stat.label}: {stat.value}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {description && (
              <p className="mt-1 text-base text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Right: actions */}
      {actions && (
        <div className="relative flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
