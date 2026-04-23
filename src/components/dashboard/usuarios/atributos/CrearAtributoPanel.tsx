"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Tag, Hash, Pencil } from "lucide-react";
import { toast } from "sonner";

interface CampoValor {
  id: string;
  valor: string;
}

interface CrearAtributoPanelProps {
  descripcionAtributo: string;
  setDescripcionAtributo: (descripcion: string) => void;
  camposActuales: CampoValor[];
  setCamposActuales: React.Dispatch<React.SetStateAction<CampoValor[]>>;
  nuevoCampo: CampoValor;
  setNuevoCampo: React.Dispatch<React.SetStateAction<CampoValor>>;
  editandoId: string | null;
  onCrearAtributo: () => void;
}

export default function CrearAtributoPanel({
  descripcionAtributo,
  setDescripcionAtributo,
  camposActuales,
  setCamposActuales,
  nuevoCampo,
  setNuevoCampo,
  editandoId,
  onCrearAtributo,
}: CrearAtributoPanelProps) {
  const modoEdicion = editandoId !== null;
  // 🔍 DEBUG: Rastrear props
  console.log("➕ [CrearAtributoPanel] Props:", {
    descripcionAtributo,
    camposActualesCount: camposActuales.length,
    nuevoCampo,
  });

  // Agregar nuevo campo a la colección actual
  const agregarCampo = () => {
    if (!nuevoCampo.id.trim() || !nuevoCampo.valor.trim()) {
      toast.error("Por favor completa tanto el ID como el Valor");
      return;
    }

    // Verificar que el ID no exista ya
    if (camposActuales.some((campo) => campo.id === nuevoCampo.id.trim())) {
      toast.error("Ya existe un campo con ese ID");
      return;
    }

    const nuevoCampoItem: CampoValor = {
      id: nuevoCampo.id.trim(),
      valor: nuevoCampo.valor.trim(),
    };

    setCamposActuales((prev) => [...prev, nuevoCampoItem]);
    setNuevoCampo({ id: "", valor: "" });
  };

  // Eliminar campo de la colección actual
  const eliminarCampo = (idCampo: string) => {
    setCamposActuales((prev) => prev.filter((campo) => campo.id !== idCampo));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      agregarCampo();
    }
  };

  return (
    <div className="w-[48%] space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            {modoEdicion ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {modoEdicion ? "Editar Atributo" : "Crear Nuevo Atributo"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 px-6 xl:px-8 pb-8 flex-1 overflow-y-auto">
          {/* Descripción del Atributo */}
          <div className="space-y-3">
            <Label htmlFor="descripcion" className="text-base font-medium">
              Descripción del Atributo
            </Label>
            <Textarea
              id="descripcion"
              placeholder="Ej: Configuración de preferencias, Datos adicionales, etc."
              value={descripcionAtributo}
              onChange={(e) => setDescripcionAtributo(e.target.value)}
              rows={4}
              className="resize-none text-base"
            />
          </div>

          {/* Agregar Campos ID-Valor */}
          <div className="space-y-4">
            <Label className="text-base font-medium">Campos ID-Valor</Label>

            <div className="flex gap-6">
              <div className="flex-1 min-w-0">
                <Input
                  placeholder="ID del campo"
                  value={nuevoCampo.id}
                  onChange={(e) =>
                    setNuevoCampo((prev) => ({ ...prev, id: e.target.value }))
                  }
                  onKeyPress={handleKeyPress}
                  className="w-full h-12 text-base"
                />
              </div>
              <div className="flex-1 min-w-0">
                <Input
                  placeholder="Valor del campo"
                  value={nuevoCampo.valor}
                  onChange={(e) =>
                    setNuevoCampo((prev) => ({
                      ...prev,
                      valor: e.target.value,
                    }))
                  }
                  onKeyPress={handleKeyPress}
                  className="w-full h-12 text-base"
                />
              </div>
              <Button
                type="button"
                onClick={agregarCampo}
                size="lg"
                className="shrink-0 h-12 px-8"
              >
                <Plus className="w-5 h-5" />
              </Button>
            </div>

            {/* Lista de campos actuales */}
            {camposActuales.length > 0 && (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                <Label className="text-sm text-muted-foreground">
                  Campos agregados ({camposActuales.length}):
                </Label>
                {camposActuales.map((campo, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Hash className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{campo.id}:</span>
                      <span className="text-sm text-muted-foreground">
                        {campo.valor}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => eliminarCampo(campo.id)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Botón para crear/actualizar atributo */}
          <Button
            type="button"
            onClick={onCrearAtributo}
            disabled={
              !descripcionAtributo.trim() || camposActuales.length === 0
            }
            className="w-full h-12 text-base"
            size="lg"
            variant={modoEdicion ? "default" : "default"}
          >
            {modoEdicion ? (
              <><Pencil className="w-5 h-5 mr-2" />Actualizar Atributo</>
            ) : (
              <><Tag className="w-5 h-5 mr-2" />Crear Atributo</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
