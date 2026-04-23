"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Save, X, Settings } from "lucide-react";
import CrearAtributoPanel from "./atributos/CrearAtributoPanel";
import ListaAtributosPanel from "./atributos/ListaAtributosPanel";
import { useAtributos } from "./atributos/useAtributos";

interface AtributosModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: number;
  userName: string;
}

export default function AtributosModal({
  isOpen,
  onClose,
  userId,
  userName,
}: AtributosModalProps) {
  const {
    atributos,
    descripcionAtributo,
    setDescripcionAtributo,
    camposActuales,
    setCamposActuales,
    nuevoCampo,
    setNuevoCampo,
    editandoId,
    saving,
    loading,
    crearAtributo,
    editarAtributo,
    eliminarAtributo,
    guardarAtributos,
    limpiarEstado,
  } = useAtributos(userId, isOpen);

  // Debug
  console.log("[AtributosModal] atributos:", atributos.length, "saving:", saving);

  const handleClose = () => {
    limpiarEstado();
    onClose();
  };

  const handleSave = async () => {
    const success = await guardarAtributos();
    if (success) {
      handleClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent 
        className="!max-w-none w-[96vw] h-[90vh] overflow-hidden flex flex-col"
        data-no-loading="true"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Gestionar Atributos - {userName}
          </DialogTitle>
          <DialogDescription>
            Crea atributos personalizados con campos ID-Valor para el usuario.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden flex gap-6 xl:gap-10">
          <CrearAtributoPanel
            descripcionAtributo={descripcionAtributo}
            setDescripcionAtributo={setDescripcionAtributo}
            camposActuales={camposActuales}
            setCamposActuales={setCamposActuales}
            nuevoCampo={nuevoCampo}
            setNuevoCampo={setNuevoCampo}
            editandoId={editandoId}
            onCrearAtributo={crearAtributo}
          />

          <ListaAtributosPanel
            atributos={atributos}
            loading={false}
            onEditarAtributo={editarAtributo}
            onEliminarAtributo={eliminarAtributo}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={saving}
            size="lg"
            className="h-12 px-10"
          >
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || atributos.length === 0}
            size="lg"
            className="h-12 px-10"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Guardando..." : "Guardar Atributos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
