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
import { apiGetTiposCapa, apiABMTipoCapa } from "@/services/api";
import { toast } from "sonner";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { debounce } from "lodash";
import { Edit, Trash2 } from "lucide-react";
import NuevoTipoCapaModal from "@/components/configuracion/modals/NuevoTipoCapaModal";

interface TipoCapa {
  tipoCapaId: string;
  tipoCapaNombre: string;
  tipoCapaEstado: string;
}

export default function TiposCapa() {
  const [tiposCapa, setTiposCapa] = useState<TipoCapa[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  useEffect(() => {
    const fetchTiposCapa = async () => {
      try {
        setLoading(true);
        const data = await apiGetTiposCapa();
        
        // Mapear los datos del API al formato esperado
        const mappedData = data.sdtTipoCapa.map((tipo: any) => ({
          tipoCapaId: tipo.TipoCapaId,
          tipoCapaNombre: tipo.TipoCapaNombre,
          tipoCapaEstado: tipo.TipoCapaEstado,
        }));
        
        setTiposCapa(mappedData);
      } catch (error) {
        console.error("Error fetching tipos de capa:", error);
        toast.error("Error al cargar los tipos de capa");
      } finally {
        setLoading(false);
      }
    };

    fetchTiposCapa();
  }, []);

  const debouncedSearchTerm = useMemo(
    () => debounce((term: string) => term, 100),
    [],
  );

  const filteredData = useMemo(() => {
    return searchTerm.length >= 0
      ? tiposCapa.filter((tipo) =>
          tipo.tipoCapaNombre
            .toLowerCase()
            .includes((debouncedSearchTerm(searchTerm) ?? "").toLowerCase()),
        )
      : tiposCapa;
  }, [searchTerm, tiposCapa]);

  const handleEdit = (tipoCapaId: string) => {
    toast.info(`Editando tipo de capa: ${tipoCapaId}`);
    // TODO: Implementar funcionalidad de edición
  };

  const handleDelete = (tipoCapaId: string) => {
    toast.info(`Eliminando tipo de capa: ${tipoCapaId}`);
    // TODO: Implementar funcionalidad de eliminación
  };

  const handleCreateTipoCapa = async (nombre: string, estado: string) => {
    try {
      // Para crear un nuevo tipo de capa: Modo = "INS" (Insert), TipoCapaId = 0
      await apiABMTipoCapa("INS", 0, nombre, estado);
      toast.success("Tipo de capa creado exitosamente");
      
      // Recargar la lista de tipos de capa
      const data = await apiGetTiposCapa();
      const mappedData = data.sdtTipoCapa.map((tipo: any) => ({
        tipoCapaId: tipo.TipoCapaId,
        tipoCapaNombre: tipo.TipoCapaNombre,
        tipoCapaEstado: tipo.TipoCapaEstado,
      }));
      setTiposCapa(mappedData);
    } catch (error) {
      console.error("Error creating tipo de capa:", error);
      toast.error("Error al crear el tipo de capa");
      throw error; // Re-throw para que el modal maneje el loading
    }
  };

  const columns = [
    { accessorKey: "tipoCapaId", header: "ID" },
    { accessorKey: "tipoCapaNombre", header: "Nombre" },
    {
      accessorKey: "tipoCapaEstado",
      header: "Estado",
      cell: ({ row }: { row: { original: TipoCapa } }) => (
        <Badge
          className={
            row.original.tipoCapaEstado === "A"
              ? "bg-green-100 text-green-800 border-green-300"
              : "bg-red-100 text-red-800 border-red-300"
          }
        >
          {row.original.tipoCapaEstado === "A" ? "Activo" : "Pasivo"}
        </Badge>
      ),
    },
    {
      id: "acciones",
      header: "Acciones",
      cell: ({ row }: { row: { original: TipoCapa } }) => (
        <div className="flex space-x-2">
          <button
            onClick={() => handleEdit(row.original.tipoCapaId)}
            className="p-1 hover:bg-gray-100 rounded transition-colors duration-200"
          >
            <Edit className="h-4 w-4 text-blue-600 hover:text-blue-800" />
          </button>
          <button
            onClick={() => handleDelete(row.original.tipoCapaId)}
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
        <div className="text-lg">Cargando tipos de capa...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Tipos de Capa</h2>
        <Button 
          onClick={handleOpenModal}
          className="transition-all duration-200 hover:scale-105 hover:shadow-lg"
        >
          Nuevo
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <Input
          placeholder="Buscar por nombre..."
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
                  No hay tipos de capa disponibles.
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
          {table.getFilteredRowModel().rows.length} tipo(s) de capa total(es).
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

      <NuevoTipoCapaModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleCreateTipoCapa}
      />
    </div>
  );
}
