"use client";

import { useState } from "react";
import { useDndContext } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Package, GripVertical, X, Plus } from "lucide-react";

export interface SortableAction {
  id: string;
  nombre: string;
  codigo: string;
  ruta?: string;
}

export interface Objeto {
  id: string;
  nombre: string;
  codigo: string;
  ruta?: string;
  acciones: SortableAction[];
}

interface SortableActionItemProps {
  action: SortableAction;
  onRemove: () => void;
}

interface ObjetoCardProps {
  objeto: Objeto;
  isSelected: boolean;
  isOver: boolean;
  onSelect: () => void;
  onAddAction: (action: SortableAction) => void;
  onRemoveAction: (actionId: string) => void;
  searchTerm: string;
}

interface ObjectListProps {
  objetos: Objeto[];
  selectedObjects: string[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onObjectSelect: (objetoId: string) => void;
  onAddAction: (objetoId: string, action: SortableAction) => void;
  onRemoveAction: (objetoId: string, actionId: string) => void;
  isLoading: boolean;
}

export function SortableActionItem({ action, onRemove }: SortableActionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: action.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group flex items-center gap-3 p-3 rounded-lg border-2 
        ${isDragging ? 'border-blue-400 bg-blue-50/50' : 'border-border hover:border-blue-300'}
        transition-all duration-200 cursor-grab active:cursor-grabbing
      `}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="w-4 h-4 text-muted-foreground group-hover:text-blue-500" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{action.nombre}</span>
          <Badge variant="outline" className="text-xs">
            {action.codigo}
          </Badge>
        </div>
        {action.ruta && (
          <Badge variant="secondary" className="text-xs mt-1 font-mono">
            {action.ruta}
          </Badge>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

export function ObjetoCard({
  objeto,
  isSelected,
  isOver,
  onSelect,
  onAddAction,
  onRemoveAction,
  searchTerm,
}: ObjetoCardProps) {
  const highlightText = (text: string, search: string) => {
    if (!search) return text;
    const regex = new RegExp(`(${search})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 px-1 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <Card
      className={`
        border-2 cursor-pointer transition-all duration-200 hover:shadow-md
        ${isSelected ? 'border-blue-500 bg-blue-50/30' : 'border-border'}
        ${isOver ? 'border-green-500 bg-green-50/30' : ''}
      `}
      onClick={onSelect}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="w-4 h-4" />
          <span className="truncate">
            {highlightText(objeto.nombre, searchTerm)}
          </span>
          <Badge variant="outline" className="ml-auto">
            {objeto.codigo}
          </Badge>
        </CardTitle>
        {objeto.ruta && (
          <Badge variant="secondary" className="text-xs font-mono w-fit">
            {objeto.ruta}
          </Badge>
        )}
      </CardHeader>
      
      {isSelected && (
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Acciones seleccionadas</span>
              <Badge variant="secondary">
                {objeto.acciones.length}
              </Badge>
            </div>
            
            {objeto.acciones.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <Plus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Arrastra acciones aquí</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {objeto.acciones.map((action) => (
                  <SortableActionItem
                    key={action.id}
                    action={action}
                    onRemove={() => onRemoveAction(action.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function ObjectList({
  objetos,
  selectedObjects,
  searchTerm,
  onSearchChange,
  onObjectSelect,
  onAddAction,
  onRemoveAction,
  isLoading,
}: ObjectListProps) {
  const { active } = useDndContext();

  const filteredObjects = objetos.filter((obj) =>
    obj.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    obj.codigo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Objetos del sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-muted-foreground mt-2">Cargando objetos...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2">
      <CardHeader className="border-b bg-muted/30">
        <CardTitle className="flex items-center gap-2">
          <Package className="w-5 h-5" />
          Objetos del sistema
          <Badge variant="secondary" className="ml-auto">
            {filteredObjects.length} de {objetos.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Buscar objetos por nombre o código..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 border-2"
            />
          </div>

          {/* Lista de objetos */}
          {filteredObjects.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-muted-foreground">
                {searchTerm ? "No se encontraron objetos" : "No hay objetos disponibles"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
              {filteredObjects.map((objeto) => {
                const isOver = active?.id && selectedObjects.includes(objeto.id);
                return (
                  <ObjetoCard
                    key={objeto.id}
                    objeto={objeto}
                    isSelected={selectedObjects.includes(objeto.id)}
                    isOver={!!isOver}
                    onSelect={() => onObjectSelect(objeto.id)}
                    onAddAction={(action) => onAddAction(objeto.id, action)}
                    onRemoveAction={(actionId) => onRemoveAction(objeto.id, actionId)}
                    searchTerm={searchTerm}
                  />
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}