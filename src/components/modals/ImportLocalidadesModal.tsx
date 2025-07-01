import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

interface ImportLocalidadesModalProps {
  isOpen: boolean;
  onClose: () => void;
  departamentos: string[];
}

export default function ImportLocalidadesModal({ isOpen, onClose, departamentos }: ImportLocalidadesModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar Localidades</DialogTitle>
        </DialogHeader>
        <Select>
          <SelectTrigger>Seleccione un departamento</SelectTrigger>
          <SelectContent>
            {departamentos.map((departamento) => (
              <SelectItem key={departamento} value={departamento}>
                {departamento}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button >Importar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
