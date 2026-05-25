"use client";

import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Hash, Pencil, Tag } from "lucide-react";
import { toast } from "sonner";
import {
  InputAutocomplete,
  InputAutocompleteOption,
} from "@/components/ui/input-autocomplete";
import { SugerenciasAtributosResponse } from "@/services/api";

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
  sugerencias?: SugerenciasAtributosResponse | null;
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
  sugerencias = null,
}: CrearAtributoPanelProps) {
  const modoEdicion = editandoId !== null;

  // Mapa key→valores y valor→keys de la descripción seleccionada
  const valoresPorKey = useMemo(() => {
    if (!sugerencias || !descripcionAtributo) return {} as Record<string, string[]>;
    return sugerencias.porAtributo[descripcionAtributo]?.valoresPorKey ?? {};
  }, [sugerencias, descripcionAtributo]);

  const opcionesDescripcion: InputAutocompleteOption[] = useMemo(
    () =>
      (sugerencias?.atributos ?? []).map((a) => ({ value: a, label: a })),
    [sugerencias],
  );

  const opcionesIdCampo: InputAutocompleteOption[] = useMemo(() => {
    if (!sugerencias || !descripcionAtributo) return [];
    const keys = sugerencias.porAtributo[descripcionAtributo]?.keys ?? [];
    return keys.map((k) => ({ value: k, label: k }));
  }, [sugerencias, descripcionAtributo]);

  // Opciones de valor: todas las que existan para esa key, o si no hay key seleccionada,
  // todos los valores distintos para la descripcion (asi puede arrancar por el valor).
  const opcionesValorCampo: InputAutocompleteOption[] = useMemo(() => {
    if (!descripcionAtributo) return [];
    if (nuevoCampo.id) {
      return (valoresPorKey[nuevoCampo.id] ?? []).map((v) => ({
        value: v,
        label: v,
      }));
    }
    // Sin key elegida → mostrar todos los valores distintos de la descripcion
    const todos = new Set<string>();
    for (const arr of Object.values(valoresPorKey)) {
      for (const v of arr) todos.add(v);
    }
    return Array.from(todos).map((v) => ({ value: v, label: v }));
  }, [valoresPorKey, nuevoCampo.id, descripcionAtributo]);

  // Al cambiar descripción (typing o seleccion), si cambia el atributo limpiar campos
  const handleDescripcionChange = (value: string) => {
    if (value !== descripcionAtributo) {
      setNuevoCampo({ id: "", valor: "" });
    }
    setDescripcionAtributo(value);
  };

  // Typing del ID: solo actualiza el id, no toca el valor
  const handleIdCampoChange = (value: string) => {
    setNuevoCampo((prev) => ({ ...prev, id: value }));
  };

  // Seleccion de una sugerencia de ID: auto-pair con valor si hay exactamente uno
  const handleIdCampoSelect = (value: string) => {
    const valores = valoresPorKey[value] ?? [];
    setNuevoCampo((prev) => ({
      ...prev,
      id: value,
      valor: valores.length === 1 ? valores[0] : prev.valor,
    }));
  };

  // Typing del Valor: solo actualiza el valor
  const handleValorCampoChange = (value: string) => {
    setNuevoCampo((prev) => ({ ...prev, valor: value }));
  };

  // Seleccion de una sugerencia de Valor: auto-pair con ID si hay exactamente uno asociado
  const handleValorCampoSelect = (value: string) => {
    // Buscar todas las keys que contienen este valor
    const keysQueLoContienen: string[] = [];
    for (const [k, vs] of Object.entries(valoresPorKey)) {
      if (vs.includes(value)) keysQueLoContienen.push(k);
    }
    setNuevoCampo((prev) => ({
      ...prev,
      valor: value,
      id:
        !prev.id && keysQueLoContienen.length === 1
          ? keysQueLoContienen[0]
          : prev.id,
    }));
  };

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
            <InputAutocomplete
              id="descripcion"
              options={opcionesDescripcion}
              value={descripcionAtributo}
              onChange={handleDescripcionChange}
              placeholder="Escribí o seleccioná una descripción..."
              emptyText="Empezá a escribir para sugerencias"
            />
          </div>

          {/* Agregar Campos ID-Valor */}
          <div className="space-y-4">
            <Label className="text-base font-medium">Campos ID-Valor</Label>

            <div className="flex gap-6">
              <div className="flex-1 min-w-0">
                <InputAutocomplete
                  options={opcionesIdCampo}
                  value={nuevoCampo.id}
                  onChange={handleIdCampoChange}
                  onSelectSuggestion={handleIdCampoSelect}
                  placeholder="ID del campo (escribí o seleccioná)"
                  emptyText="Sin sugerencias previas"
                />
              </div>
              <div className="flex-1 min-w-0">
                <InputAutocomplete
                  options={opcionesValorCampo}
                  value={nuevoCampo.valor}
                  onChange={handleValorCampoChange}
                  onSelectSuggestion={handleValorCampoSelect}
                  placeholder="Valor del campo (escribí o seleccioná)"
                  emptyText="Sin sugerencias previas"
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
