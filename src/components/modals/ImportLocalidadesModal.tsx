import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { importarLocalidades } from "@/services/api";
import { toast } from "sonner";

interface ImportLocalidadesModalProps {
  isOpen: boolean;
  onClose: () => void;
  departamentos: string[];
}

export default function ImportLocalidadesModal({ isOpen, onClose, departamentos }: ImportLocalidadesModalProps) {
  const [departamento, setDepartamento] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const importar = async () => {
    if (!departamento) {
      toast.error("Por favor, seleccione un departamento para importar localidades.");
      return;
    }
    setLoading(true);
    try {
      await importarLocalidades(departamento);
      toast.success("Localidades importadas correctamente.");
      onClose();
    } catch (error: any) {
      console.error("Error importando localidades:", error.message);
      toast.error("Error al importar localidades. Consulte la consola para más detalles.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar Localidades</DialogTitle>
        </DialogHeader>
        <Select value={departamento} onValueChange={setDepartamento}>
          <SelectTrigger>Seleccione un departamento</SelectTrigger>
          <SelectContent>
            {departamentos.map((dep) => (
              <SelectItem key={dep} value={dep}>
                {dep}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={importar} disabled={loading || !departamento}>
            {loading ? "Importando..." : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
