"use client";

import React from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { Save, X, Settings } from "lucide-react";
import CrearAtributoPanel from "@/components/dashboard/usuarios/atributos/CrearAtributoPanel";
import ListaAtributosPanel from "@/components/dashboard/usuarios/atributos/ListaAtributosPanel";
import { useAtributosRol } from "./atributos/useAtributosRol";

interface AtributosRolModalProps {
  isOpen: boolean;
  onClose: () => void;
  rolId: number;
  rolNombre: string;
}

export default function AtributosRolModal({
  isOpen,
  onClose,
  rolId,
  rolNombre,
}: AtributosRolModalProps) {
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
  } = useAtributosRol(rolId, isOpen);

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
      title={`Gestionar Atributos — ${rolNombre}`}
      description="Crea atributos personalizados con campos ID-Valor para el rol."
      icon={Settings}
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
        />

        <ListaAtributosPanel
          atributos={atributos}
          loading={loading}
          onEditarAtributo={editarAtributo}
          onEliminarAtributo={eliminarAtributo}
        />
      </div>
    </ModalShell>
  );
}
