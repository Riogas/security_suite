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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface NuevoPuestoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (descripcion: string, estado: string) => void;
}

export default function NuevoPuestoModal({
  isOpen,
  onClose,
  onConfirm,
}: NuevoPuestoModalProps) {
  const [descripcion, setDescripcion] = useState("");
  const [estado, setEstado] = useState("A");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!descripcion.trim()) {
      toast.error("La descripción del puesto es requerida");
      return;
    }

    try {
      setLoading(true);
      await onConfirm(descripcion.trim(), estado);
      // Resetear formulario
      setDescripcion("");
      setEstado("A");
      onClose();
    } catch (error) {
      console.error("Error al crear puesto:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Resetear formulario al cancelar
    setDescripcion("");
    setEstado("A");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-500 ease-out shadow-2xl">
        <DialogHeader className="animate-in slide-in-from-top-2 duration-700 delay-100">
          <DialogTitle className="animate-in zoom-in-50 duration-500 delay-200">
            Nuevo Puesto
          </DialogTitle>
          <DialogDescription className="animate-in fade-in duration-600 delay-300">
            Crear un nuevo puesto de trabajo en el sistema.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 py-4 animate-in slide-in-from-left-4 duration-600 delay-400">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="descripcion" className="text-right">
                Descripción
              </Label>
              <Input
                id="descripcion"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="col-span-3 transition-all duration-200 focus:scale-105"
                placeholder="Ingrese la descripción del puesto"
                disabled={loading}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="estado" className="text-right">
                Estado
              </Label>
              <Select value={estado} onValueChange={setEstado} disabled={loading}>
                <SelectTrigger className="col-span-3 transition-all duration-200 focus:scale-105">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Activo</SelectItem>
                  <SelectItem value="P">Pasivo</SelectItem>
                </SelectContent>
              </Select>
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
              {loading ? "Creando..." : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
