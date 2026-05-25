"use client";

import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogPortal,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

// ── Size map ────────────────────────────────────────────────────────────────

const sizeClasses: Record<string, string> = {
  sm: "w-[min(95vw,420px)]",
  md: "w-[min(95vw,560px)]",
  lg: "w-[min(95vw,720px)]",
  xl: "w-[min(95vw,900px)]",
  full: "w-[min(95vw,1200px)]",
};

// ── Tone map ─────────────────────────────────────────────────────────────────

type Tone = "default" | "danger" | "success" | "warning";

const toneIconClasses: Record<Tone, string> = {
  default: "bg-primary/10 text-primary",
  danger: "bg-destructive/10 text-destructive",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

const toneFooterClasses: Record<Tone, string> = {
  default: "bg-muted/30",
  danger: "bg-destructive/5",
  success: "bg-emerald-500/5",
  warning: "bg-amber-500/5",
};

// ── Animation variants ───────────────────────────────────────────────────────

// Custom expo-out easing — matches herogreeting.tsx pattern
const EASING = [0.22, 1, 0.36, 1] as [number, number, number, number];

const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: 0.18, ease: "easeIn" } },
};

const contentVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.2, ease: EASING },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 8,
    transition: { duration: 0.18, ease: "easeIn" },
  },
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface ModalShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Lucide icon rendered in a styled circle in the header */
  icon?: LucideIcon;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  /** Accent color for the icon container and footer tint */
  tone?: Tone;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** If true, body scrolls and header/footer remain sticky (default: true) */
  scrollableBody?: boolean;
  className?: string;
  /** If true, clicking outside and Escape will not close the modal */
  preventClose?: boolean;
  /** Allow arbitrary data-* attributes for compatibility with existing callers */
  [key: `data-${string}`]: unknown;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ModalShell({
  open,
  onOpenChange,
  title,
  description,
  icon: Icon,
  size = "md",
  tone = "default",
  children,
  footer,
  scrollableBody = true,
  className,
  preventClose = false,
}: ModalShellProps) {
  const sizeClass = sizeClasses[size] ?? sizeClasses.md;
  const isFull = size === "full";

  return (
    <Dialog open={open} onOpenChange={preventClose ? undefined : onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPortal forceMount>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-50 bg-background/70 backdrop-blur-md"
              variants={overlayVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              aria-hidden="true"
              onClick={preventClose ? undefined : () => onOpenChange(false)}
            />

            {/* Content */}
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
              <motion.div
                className={cn(
                  "pointer-events-auto",
                  "relative flex flex-col",
                  "bg-card border border-border/50 shadow-2xl shadow-black/20 dark:shadow-black/40 rounded-2xl",
                  sizeClass,
                  "max-h-[90vh]",
                  className,
                )}
                variants={contentVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                {/* Radix Dialog.Content for a11y / keyboard handling */}
                <DialogPrimitive.Content
                  asChild
                  onInteractOutside={preventClose ? (e) => e.preventDefault() : undefined}
                  onEscapeKeyDown={preventClose ? (e) => e.preventDefault() : undefined}
                >
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-shell-title"
                    aria-describedby={description ? "modal-shell-description" : undefined}
                    className="contents"
                  >
                    {/* Header */}
                    <div className="shrink-0 flex items-start gap-3 px-6 pt-6 pb-4">
                      {Icon && (
                        <div
                          className={cn(
                            "shrink-0 size-10 rounded-xl flex items-center justify-center",
                            toneIconClasses[tone],
                          )}
                          aria-hidden="true"
                        >
                          <Icon className="size-5" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 pr-8">
                        <DialogTitle
                          id="modal-shell-title"
                          className="text-xl font-semibold tracking-tight leading-tight"
                        >
                          {title}
                        </DialogTitle>
                        {description && (
                          <DialogDescription
                            id="modal-shell-description"
                            className="text-sm text-muted-foreground mt-1"
                          >
                            {description}
                          </DialogDescription>
                        )}
                      </div>
                    </div>

                    {/* Close button */}
                    {!preventClose && (
                      <DialogClose
                        className={cn(
                          "absolute top-4 right-4 size-8 rounded-lg",
                          "flex items-center justify-center",
                          "text-muted-foreground hover:text-foreground hover:bg-muted",
                          "transition-colors duration-150",
                          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                          "disabled:pointer-events-none",
                        )}
                        aria-label="Cerrar"
                      >
                        <XIcon className="size-4" aria-hidden="true" />
                      </DialogClose>
                    )}

                    {/* Body */}
                    <div
                      className={cn(
                        "px-6 py-2 min-h-0",
                        scrollableBody && isFull
                          ? "flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border"
                          : scrollableBody
                          ? "overflow-y-auto max-h-[70vh] scrollbar-thin scrollbar-thumb-border flex-1"
                          : "flex-1",
                      )}
                    >
                      {children}
                    </div>

                    {/* Footer */}
                    {footer && (
                      <div
                        className={cn(
                          "shrink-0 border-t border-border/50 px-6 py-4",
                          "flex items-center justify-end gap-3",
                          toneFooterClasses[tone],
                        )}
                      >
                        {footer}
                      </div>
                    )}
                  </div>
                </DialogPrimitive.Content>
              </motion.div>
            </div>
          </DialogPortal>
        )}
      </AnimatePresence>
    </Dialog>
  );
}

export default ModalShell;
