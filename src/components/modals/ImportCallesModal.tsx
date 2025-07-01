import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

interface ImportCallesModalProps {
  isOpen: boolean;
  onClose: () => void;
  localidades: string[];
}

export default function ImportCallesModal({ isOpen, onClose, localidades }: ImportCallesModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar Calles</DialogTitle>
        </DialogHeader>
        <Select>
          <SelectTrigger>Seleccione una localidad</SelectTrigger>
          <SelectContent>
            {localidades.map((localidad) => (
              <SelectItem key={localidad} value={localidad}>
                {localidad}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button>Importar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
