"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Zap, GripVertical } from "lucide-react";
import { SortableAction } from "./ObjectList";

interface DraggableActionProps {
  action: SortableAction;
  searchTerm: string;
}

interface ActionListProps {
  acciones: SortableAction[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

export function DraggableAction({ action, searchTerm }: DraggableActionProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: action.id,
    data: action,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

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
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group flex items-center gap-3 p-3 rounded-lg border-2 
        ${isDragging ? 'border-blue-400 bg-blue-50/50' : 'border-border hover:border-blue-300'}
        transition-all duration-200 cursor-grab active:cursor-grabbing
        ${isDragging ? 'shadow-lg z-50' : 'hover:shadow-md'}
      `}
      {...listeners}
      {...attributes}
    >
      <GripVertical className="w-4 h-4 text-muted-foreground group-hover:text-blue-500" />
      <Zap className="w-4 h-4 text-orange-500" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">
            {highlightText(action.nombre, searchTerm)}
          </span>
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
    </div>
  );
}

export function ActionList({ acciones, searchTerm, onSearchChange }: ActionListProps) {
  const filteredActions = acciones.filter((action) =>
    action.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    action.codigo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card className="border-2">
      <CardHeader className="border-b bg-muted/30">
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5" />
          Acciones disponibles
          <Badge variant="secondary" className="ml-auto">
            {filteredActions.length} de {acciones.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Buscar acciones por nombre o código..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 border-2"
            />
          </div>

          {/* Lista de acciones */}
          {filteredActions.length === 0 ? (
            <div className="text-center py-8">
              <Zap className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-muted-foreground">
                {searchTerm ? "No se encontraron acciones" : "No hay acciones disponibles"}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredActions.map((action) => (
                <DraggableAction
                  key={action.id}
                  action={action}
                  searchTerm={searchTerm}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}