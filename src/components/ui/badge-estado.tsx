import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { type VariantProps } from "class-variance-authority";
import { badgeVariants } from "@/components/ui/badge";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const DEFAULT_LABEL_MAP: Record<string, string> = {
  A: "Activo",
  I: "Inactivo",
  P: "Pendiente",
  S: "Activo",
  N: "Inactivo",
  ALLOW: "ALLOW",
  DENY: "DENY",
};

const DEFAULT_VARIANT_MAP: Record<string, BadgeVariant> = {
  A: "success",
  S: "success",
  ALLOW: "success",
  I: "secondary",
  N: "secondary",
  DENY: "destructive",
  P: "warning",
};

interface BadgeEstadoProps {
  estado: string;
  labelMap?: Record<string, string>;
}

export function BadgeEstado({ estado, labelMap }: BadgeEstadoProps) {
  const labels = labelMap ? { ...DEFAULT_LABEL_MAP, ...labelMap } : DEFAULT_LABEL_MAP;
  const label = labels[estado] ?? estado;
  const variant: BadgeVariant = DEFAULT_VARIANT_MAP[estado] ?? "outline";

  return <Badge variant={variant}>{label}</Badge>;
}
