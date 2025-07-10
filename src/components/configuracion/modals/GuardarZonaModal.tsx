"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface GuardarZonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (capaNombre: string) => void;
}

export default function GuardarZonaModal({
  isOpen,
  onClose,
  onConfirm,
}: GuardarZonaModalProps) {
  const [capaNombre, setCapaNombre] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!capaNombre.trim()) {
      toast.error("El nombre de la capa es requerido");
      return;
    }

    try {
      setLoading(true);
      await onConfirm(capaNombre.trim());
      // Resetear formulario
      setCapaNombre("");
      onClose();
    } catch (error) {
      console.error("Error al guardar zona:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Resetear formulario al cancelar
    setCapaNombre("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-500 ease-out shadow-2xl">
        <DialogHeader className="animate-in slide-in-from-top-2 duration-700 delay-100">
          <DialogTitle className="animate-in zoom-in-50 duration-500 delay-200">
            Guardar Zona
          </DialogTitle>
          <DialogDescription className="animate-in fade-in duration-600 delay-300">
            Ingrese el nombre de la capa para guardar las zonas dibujadas.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 py-4 animate-in slide-in-from-left-4 duration-600 delay-400">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="capaNombre" className="text-right">
                Nombre de la Capa
              </Label>
              <Input
                id="capaNombre"
                value={capaNombre}
                onChange={(e) => setCapaNombre(e.target.value)}
                className="col-span-3 transition-all duration-200 focus:scale-105"
                placeholder="Ingrese el nombre de la capa"
                disabled={loading}
              />
            </div>
          </div>
          
          <DialogFooter className="animate-in slide-in-from-bottom-4 duration-600 delay-500">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={loading}
              className="transition-all duration-200 hover:scale-105"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="transition-all duration-200 hover:scale-105"
            >
              {loading ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
