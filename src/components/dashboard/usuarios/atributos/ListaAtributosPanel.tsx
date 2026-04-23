"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings, Type, Trash2, Hash, Pencil } from "lucide-react";

interface CampoValor {
  id: string;
  valor: string;
}

interface Atributo {
  id: string;
  descripcion: string;
  campos: CampoValor[];
  valor: string; // JSON generado
}

interface ListaAtributosPanelProps {
  atributos: Atributo[];
  loading: boolean;
  onEditarAtributo: (id: string) => void;
  onEliminarAtributo: (id: string) => void;
}

export default function ListaAtributosPanel({
  atributos,
  loading,
  onEditarAtributo,
  onEliminarAtributo,
}: ListaAtributosPanelProps) {
  if (loading) {
    return (
      <div className="w-[52%] space-y-6">
        <Card className="h-full">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Type className="w-4 h-4" />
              Atributos Creados
              <Badge variant="secondary" className="ml-auto">
                0
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 xl:px-8 pb-8 flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <div className="text-center">
                <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-gray-900 rounded-full mx-auto mb-2"></div>
                <p className="text-sm">Cargando atributos...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-[52%] space-y-6">
      <Card className="h-full">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Type className="w-4 h-4" />
            Atributos Creados
            <Badge variant="secondary" className="ml-auto">
              {atributos.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 xl:px-8 pb-8 flex-1 min-h-0 overflow-hidden">
          {atributos.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <div className="text-center">
                <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No hay atributos creados</p>
                <p className="text-xs">
                  Crea tu primer atributo en el panel izquierdo
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {atributos.map((atributo) => {
                const esNuevo = atributo.id.startsWith("nuevo-");
                return (
                  <div
                    key={atributo.id}
                    className="border rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-base">
                            {atributo.descripcion}
                          </h4>
                          {esNuevo && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-green-50 text-green-700 border-green-200"
                            >
                              Nuevo
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {atributo.campos.length} campos configurados
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditarAtributo(atributo.id)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          title="Editar atributo"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEliminarAtributo(atributo.id)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Eliminar atributo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                  {/* Mostrar campos */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Campos:
                    </p>
                    <div className="grid grid-cols-1 gap-1">
                      {atributo.campos.map((campo, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-xs"
                        >
                          <Hash className="w-3 h-3 text-muted-foreground" />
                          <span className="font-medium">{campo.id}:</span>
                          <span className="text-muted-foreground truncate">
                            {campo.valor}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Vista previa del JSON */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Valor JSON:
                    </p>
                    <div className="bg-muted p-3 rounded text-xs font-mono max-h-32 overflow-y-auto">
                      <pre className="whitespace-pre-wrap">
                        {atributo.valor}
                      </pre>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
