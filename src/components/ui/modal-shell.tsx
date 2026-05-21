"use client";

import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const sizeClasses: Record<string, string> = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl w-[95vw]",
  full: "max-w-none w-[96vw] h-[90vh]",
};

export interface ModalShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  icon?: LucideIcon;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** If true (default), body scrolls and header/footer remain sticky. */
  scrollableBody?: boolean;
  className?: string;
  [key: string]: unknown;
}

export function ModalShell({
  open,
  onOpenChange,
  title,
  description,
  icon: Icon,
  size = "md",
  children,
  footer,
  scrollableBody = true,
  className,
  ...rest
}: ModalShellProps) {
  const sizeClass = sizeClasses[size] ?? sizeClasses.md;
  const isFull = size === "full";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          sizeClass,
          isFull ? "flex flex-col overflow-hidden" : "",
          className,
        )}
        {...rest}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {Icon && <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />}
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        <div
          className={cn(
            "py-2",
            scrollableBody && isFull
              ? "flex-1 overflow-auto min-h-0"
              : scrollableBody
              ? "overflow-auto max-h-[calc(85vh-120px)]"
              : "",
          )}
        >
          {children}
        </div>

        {footer && (
          <div className="flex justify-end gap-2 shrink-0 pt-2 border-t">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ModalShell;
