"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (itemsPerPage: number) => void;
}

export function PaginationControls({
  currentPage,
  totalPages,
  itemsPerPage,
  totalItems,
  onPageChange,
  onItemsPerPageChange,
}: PaginationControlsProps) {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const getVisiblePages = () => {
    const pages = [];
    const showPages = 5; // Número de páginas a mostrar
    
    let start = Math.max(1, currentPage - Math.floor(showPages / 2));
    const end = Math.min(totalPages, start + showPages - 1);
    
    // Ajustar el inicio si no hay suficientes páginas al final
    if (end - start + 1 < showPages) {
      start = Math.max(1, end - showPages + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    return pages;
  };

  if (totalPages <= 1) {
    return (
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Mostrando {totalItems} de {totalItems} elementos
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Elementos por página:</span>
          <div className="flex gap-1">
            {[5, 10, 20, 50].map((size) => (
              <Button
                key={size}
                variant={itemsPerPage === size ? "default" : "outline"}
                size="sm"
                onClick={() => onItemsPerPageChange(size)}
                className="h-8 w-12"
              >
                {size}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="text-sm text-muted-foreground">
        Mostrando <Badge variant="secondary">{startItem}</Badge> a{" "}
        <Badge variant="secondary">{endItem}</Badge> de{" "}
        <Badge variant="secondary">{totalItems}</Badge> elementos
      </div>

      <div className="flex items-center gap-4">
        {/* Elementos por página */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Por página:</span>
          <div className="flex gap-1">
            {[5, 10, 20, 50].map((size) => (
              <Button
                key={size}
                variant={itemsPerPage === size ? "default" : "outline"}
                size="sm"
                onClick={() => onItemsPerPageChange(size)}
                className="h-8 w-12"
              >
                {size}
              </Button>
            ))}
          </div>
        </div>

        {/* Controles de paginación */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className="h-8 w-8 p-0"
          >
            <ChevronsLeft className="w-4 h-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          {getVisiblePages().map((page) => (
            <Button
              key={page}
              variant={currentPage === page ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(page)}
              className="h-8 w-8 p-0"
            >
              {page}
            </Button>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className="h-8 w-8 p-0"
          >
            <ChevronsRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          Página <Badge variant="outline">{currentPage}</Badge> de{" "}
          <Badge variant="outline">{totalPages}</Badge>
        </div>
      </div>
    </div>
  );
}