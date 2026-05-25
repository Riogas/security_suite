import * as React from "react";
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
  stats?: PageHeaderStat[];
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  stats,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b pb-6 mb-6 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      {/* Left: title + description + stats */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            {title}
          </h1>
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

      {/* Right: actions */}
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
