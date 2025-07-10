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

interface NuevoTipoCapaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (nombre: string, estado: string) => void;
}

export default function NuevoTipoCapaModal({
  isOpen,
  onClose,
  onConfirm,
}: NuevoTipoCapaModalProps) {
  const [nombre, setNombre] = useState("");
  const [estado, setEstado] = useState("A"); // Activo por defecto
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nombre.trim()) {
      toast.error("El nombre del tipo de capa es requerido");
      return;
    }

    try {
      setLoading(true);
      await onConfirm(nombre.trim(), estado);
      // Resetear formulario
      setNombre("");
      setEstado("A");
      onClose();
    } catch (error) {
      console.error("Error al crear tipo de capa:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Resetear formulario al cancelar
    setNombre("");
    setEstado("A");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-500 ease-out shadow-2xl">
        <DialogHeader className="animate-in slide-in-from-top-2 duration-700 delay-100">
          <DialogTitle className="animate-in zoom-in-50 duration-500 delay-200">
            Nuevo Tipo de Capa
          </DialogTitle>
          <DialogDescription className="animate-in fade-in duration-600 delay-300">
            Ingrese los datos del nuevo tipo de capa.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nombre" className="text-right">
                Nombre
              </Label>
              <Input
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="col-span-3"
                placeholder="Ingrese el nombre del tipo de capa"
                disabled={loading}
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="estado" className="text-right">
                Estado
              </Label>
              <Select value={estado} onValueChange={setEstado} disabled={loading}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Seleccione un estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Activo</SelectItem>
                  <SelectItem value="P">Pasivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
