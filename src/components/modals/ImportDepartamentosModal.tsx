import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ImportDepartamentosModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ImportDepartamentosModal({ isOpen, onClose }: ImportDepartamentosModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar Departamentos</DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          <p>Se va a realizar la importación de los departamentos, ¿desea continuar?</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
