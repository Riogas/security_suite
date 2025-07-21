"use client";
import React, { useEffect, useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { debounce } from "lodash";
import { Edit, Trash2, MapPin } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
} from "@tanstack/react-table";

import { apiGetCapaGoya } from "@/services/api";
import { GenexusFeatureCollectionToGeoJson } from "@/lib/convertirGeoJson";
import MostrarMapaModal from "@/components/configuracion/modals/MostrarMapaModal";

interface Capa {
  CapaId: string;
  TipoCapaId: string;
  CapaNombre: string;
  CapaEstado: string;
  CapaInicio: string;
  CapaFin: string;
  CapaGeoJson: string;
  PuestoId: string;
}

export default function Capa() {
  const [capas, setCapas] = useState<Capa[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mapModal, setMapModal] = useState<{ open: boolean; geojson: any | null }>({ open: false, geojson: null });

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  useEffect(() => {
    const fetchCapas = async () => {
      try {
        setLoading(true);
        // Puedes cambiar estos valores por defecto según tu lógica de negocio
        const data = await apiGetCapaGoya({ PuestoId: "", TipoCapaId: "" });
        setCapas(data.sdtCapasGoya || []);
      } catch (error) {
        setCapas([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCapas();
  }, []);

  const debouncedSearchTerm = useMemo(
    () => debounce((term: string) => term, 100),
    [],
  );

  const filteredData = useMemo(() => {
    return searchTerm.length > 0
      ? capas.filter((capa) =>
          capa.CapaNombre
            .toLowerCase()
            .includes((debouncedSearchTerm(searchTerm) ?? "").toLowerCase()),
        )
      : capas;
  }, [searchTerm, capas]);

  const handleEdit = (id: string) => {
    // TODO: Implementar funcionalidad de edición
    alert(`Editando capa: ${id}`);
  };

  const handleDelete = (id: string) => {
    // TODO: Implementar funcionalidad de eliminación
    alert(`Eliminando capa: ${id}`);
  };

  const handleShowMap = (geojson: string) => {
    let parsed: any = null;
    try {
      parsed = typeof geojson === "string" ? JSON.parse(geojson) : geojson;
    } catch {
      parsed = null;
    }
    // Si es FeatureCollection con coords {lng,lat}, convertir a GeoJSON válido
    if (parsed && parsed.type === "FeatureCollection") {
      parsed = GenexusFeatureCollectionToGeoJson(parsed);
    }
    setMapModal({ open: true, geojson: parsed });
  };

  // TODO: Implementar modal de creación
  const handleCreateCapa = async (/* ... */) => {
    // ...
  };

  const columns = [
    { accessorKey: "TipoCapaId", header: "Tipo Capa" },
    { accessorKey: "CapaNombre", header: "Capa" },
    {
      accessorKey: "CapaEstado",
      header: "Estado",
      cell: ({ row }: { row: { original: Capa } }) => (
        <Badge
          className={
            row.original.CapaEstado === "A"
              ? "bg-green-100 text-green-800 border-green-300"
              : "bg-red-100 text-red-800 border-red-300"
          }
        >
          {row.original.CapaEstado === "A" ? "Activo" : "Pasivo"}
        </Badge>
      ),
    },
    { accessorKey: "CapaInicio", header: "Inicio" },
    { accessorKey: "CapaFin", header: "Fin" },
    {
      id: "mapa",
      header: "",
      cell: ({ row }: { row: { original: Capa } }) => (
        <Button variant="ghost" size="icon" onClick={() => handleShowMap(row.original.CapaGeoJson)}>
          <MapPin className="h-5 w-5 text-blue-600" />
        </Button>
      ),
    },
    {
      id: "acciones",
      header: "Acciones",
      cell: ({ row }: { row: { original: Capa } }) => (
        <div className="flex space-x-2">
          <button
            onClick={() => handleEdit(row.original.CapaId)}
            className="p-1 hover:bg-gray-100 rounded transition-colors duration-200"
          >
            <Edit className="h-4 w-4 text-blue-600 hover:text-blue-800" />
          </button>
          <button
            onClick={() => handleDelete(row.original.CapaId)}
            className="p-1 hover:bg-gray-100 rounded transition-colors duration-200"
          >
            <Trash2 className="h-4 w-4 text-red-600 hover:text-red-800" />
          </button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="text-lg">Cargando capas...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Capas</h2>
        <Button 
          onClick={handleOpenModal}
          className="transition-all duration-200 hover:scale-105 hover:shadow-lg"
        >
          Nueva
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <Input
          placeholder="Buscar por capa..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No hay capas disponibles.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex justify-between items-center mt-2 p-2">
          <div className="flex items-center gap-2">
            <span>Registros por página</span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="border rounded px-2 py-1 bg-secondary"
            >
              {[10, 25, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <span>
            Página {table.getState().pagination.pageIndex + 1} de{" "}
            {table.getPageCount()}
          </span>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              «
            </Button>
            <Button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              ‹
            </Button>
            <Button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              ›
            </Button>
            <Button
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              »
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredRowModel().rows.length} capa(s) total(es).
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Siguiente
          </Button>
        </div>
      </div>

      {/* Modal para mostrar el mapa */}
      {mapModal.open && (
        <MostrarMapaModal
          isOpen={mapModal.open}
          geojson={mapModal.geojson}
          onClose={() => setMapModal({ open: false, geojson: null })}
          title="Mapa de la Capa"
          description="Visualización del polígono de la capa en el mapa."
        />
      )}

      {/* Modal de creación aquí si lo necesitas */}
    </div>
  );
}
