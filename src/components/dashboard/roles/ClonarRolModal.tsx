"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  // Reiniciar el nombre cuando cambia el rol o se abre el modal
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
    } catch (err: any) {
      setError(err?.message || "Error al clonar el rol");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Clonar rol</DialogTitle>
        </DialogHeader>

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
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleClonar}
            disabled={nombre.trim() === "" || loading}
          >
            {loading ? "Clonando..." : "Clonar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
