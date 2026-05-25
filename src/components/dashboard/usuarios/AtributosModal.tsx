"use client";

import React from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { Save, X, Tag } from "lucide-react";
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
    sugerencias,
    crearAtributo,
    editarAtributo,
    eliminarAtributo,
    guardarAtributos,
    limpiarEstado,
  } = useAtributos(userId, isOpen);

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
    <ModalShell
      open={isOpen}
      onOpenChange={handleClose}
      title={`Gestionar Atributos — ${userName}`}
      description="Crea atributos personalizados con campos ID-Valor para el usuario."
      icon={Tag}
      size="full"
      scrollableBody={false}
      data-no-loading="true"
      footer={
        <>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={saving}
            size="lg"
            className="h-12 px-10"
          >
            <X className="w-4 h-4 mr-2" aria-hidden="true" />
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || atributos.length === 0}
            size="lg"
            className="h-12 px-10"
          >
            <Save className="w-4 h-4 mr-2" aria-hidden="true" />
            {saving ? "Guardando..." : "Guardar Atributos"}
          </Button>
        </>
      }
    >
      <div className="flex-1 min-h-0 overflow-hidden flex gap-6 xl:gap-10 h-full">
        <CrearAtributoPanel
          descripcionAtributo={descripcionAtributo}
          setDescripcionAtributo={setDescripcionAtributo}
          camposActuales={camposActuales}
          setCamposActuales={setCamposActuales}
          nuevoCampo={nuevoCampo}
          setNuevoCampo={setNuevoCampo}
          editandoId={editandoId}
          onCrearAtributo={crearAtributo}
          sugerencias={sugerencias}
        />

        <ListaAtributosPanel
          atributos={atributos}
          loading={false}
          onEditarAtributo={editarAtributo}
          onEliminarAtributo={eliminarAtributo}
        />
      </div>
    </ModalShell>
  );
}
