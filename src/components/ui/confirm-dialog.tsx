"use client";

import * as React from "react";
import { type LucideIcon, AlertTriangle } from "lucide-react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger" | "success" | "warning";
  icon?: LucideIcon;
  onConfirm: () => void | Promise<void>;
  /** Set to true while the confirm action is in progress */
  loading?: boolean;
}

/**
 * Reusable confirmation dialog built on top of ModalShell.
 * Replaces browser-native confirm() for destructive operations.
 *
 * @example
 * <ConfirmDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="¿Eliminar este rol?"
 *   description="Esta acción no se puede deshacer."
 *   tone="danger"
 *   confirmLabel="Eliminar"
 *   onConfirm={handleDelete}
 * />
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
  icon,
  onConfirm,
  loading = false,
}: ConfirmDialogProps) {
  const IconComponent = icon ?? AlertTriangle;

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      icon={IconComponent}
      size="sm"
      tone={tone}
      preventClose={loading}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "..." : confirmLabel}
          </Button>
        </>
      }
    >
      {/* Body is intentionally minimal — description carries the message */}
      <div />
    </ModalShell>
  );
}

export default ConfirmDialog;
