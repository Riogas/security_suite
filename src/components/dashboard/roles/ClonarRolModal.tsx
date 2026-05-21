"use client";

import React, { useState, useEffect } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy } from "lucide-react";

interface ClonarRolModalProps {
  isOpen: boolean;
  rolNombre: string;
  onClose: () => void;
  onClonar: (nombre: string) => Promise<void>;
}

export default function ClonarRolModal({
  isOpen,
  rolNombre,
  onClose,
  onClonar,
}: ClonarRolModalProps) {
  const [nombre, setNombre] = useState(`${rolNombre} (copia)`);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNombre(`${rolNombre} (copia)`);
      setError(null);
      setLoading(false);
    }
  }, [isOpen, rolNombre]);

  const handleClonar = async () => {
    const nombreTrimmed = nombre.trim();
    if (!nombreTrimmed) {
      setError("El nombre es obligatorio");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onClonar(nombreTrimmed);
    } catch (err: unknown) {
      setError((err as Error)?.message || "Error al clonar el rol");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Clonar rol"
      icon={Copy}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleClonar}
            disabled={nombre.trim() === "" || loading}
          >
            {loading ? "Clonando..." : "Clonar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <p className="text-sm text-muted-foreground">
          Clonar <span className="font-medium text-foreground">"{rolNombre}"</span>.
          Se copiarán las funcionalidades y atributos. Los usuarios no se copian.
        </p>

        <div className="space-y-2">
          <Label htmlFor="nombre-clon">Nombre del nuevo rol</Label>
          <Input
            id="nombre-clon"
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Nombre del rol clonado"
            disabled={loading}
            aria-invalid={!!error}
            aria-describedby={error ? "nombre-clon-error" : undefined}
            autoFocus
          />
          {error && (
            <p id="nombre-clon-error" className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
