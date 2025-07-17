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
import { apiGetPuestos, apiABMPuesto } from "@/services/api";
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
import NuevoPuestoModal from "@/components/configuracion/modals/NuevoPuestoModal";

interface Puesto {
  puestoId: string;
  puestoDsc: string;
  puestoEstado: string;
}

export default function Puestos() {
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  useEffect(() => {
    const fetchPuestos = async () => {
      try {
        setLoading(true);
        const data = await apiGetPuestos();
        
        // Mapear los datos del API al formato esperado
        const mappedData = data.sdtPuestosData.map((puesto: any) => ({
          puestoId: puesto.PuestoId,
          puestoDsc: puesto.PuestoDsc,
          puestoEstado: puesto.PuestoEstado,
        }));
        
        setPuestos(mappedData);
      } catch (error) {
        console.error("Error fetching puestos:", error);
        toast.error("Error al cargar los puestos");
      } finally {
        setLoading(false);
      }
    };

    fetchPuestos();
  }, []);

  const debouncedSearchTerm = useMemo(
    () => debounce((term: string) => term, 100),
    [],
  );

  const filteredData = useMemo(() => {
    return searchTerm.length >= 0
      ? puestos.filter((puesto) =>
          puesto.puestoDsc
            .toLowerCase()
            .includes((debouncedSearchTerm(searchTerm) ?? "").toLowerCase()),
        )
      : puestos;
  }, [searchTerm, puestos]);

  const handleEdit = (puestoId: string) => {
    toast.info(`Editando puesto: ${puestoId}`);
    // TODO: Implementar funcionalidad de edición
  };

  const handleDelete = (puestoId: string) => {
    toast.info(`Eliminando puesto: ${puestoId}`);
    // TODO: Implementar funcionalidad de eliminación
  };

  const handleCreatePuesto = async (descripcion: string, estado: string) => {
    try {
      // Para crear un nuevo puesto: Modo = "INS" (Insert), PuestoId = 0
      await apiABMPuesto("INS", 0, descripcion, estado);
      toast.success("Puesto creado exitosamente");
      
      // Recargar la lista de puestos
      const data = await apiGetPuestos();
      const mappedData = data.sdtPuestosData.map((puesto: any) => ({
        puestoId: puesto.PuestoId,
        puestoDsc: puesto.PuestoDsc,
        puestoEstado: puesto.PuestoEstado,
      }));
      setPuestos(mappedData);
    } catch (error) {
      console.error("Error creating puesto:", error);
      toast.error("Error al crear el puesto");
      throw error; // Re-throw para que el modal maneje el loading
    }
  };

  const columns = [
    { accessorKey: "puestoId", header: "ID" },
    { accessorKey: "puestoDsc", header: "Descripción" },
    {
      accessorKey: "puestoEstado",
      header: "Estado",
      cell: ({ row }: { row: { original: Puesto } }) => (
        <Badge
          className={
            row.original.puestoEstado === "A"
              ? "bg-green-100 text-green-800 border-green-300"
              : "bg-red-100 text-red-800 border-red-300"
          }
        >
          {row.original.puestoEstado === "A" ? "Activo" : "Pasivo"}
        </Badge>
      ),
    },
    {
      id: "acciones",
      header: "Acciones",
      cell: ({ row }: { row: { original: Puesto } }) => (
        <div className="flex space-x-2">
          <button
            onClick={() => handleEdit(row.original.puestoId)}
            className="p-1 hover:bg-gray-100 rounded transition-colors duration-200"
          >
            <Edit className="h-4 w-4 text-blue-600 hover:text-blue-800" />
          </button>
          <button
            onClick={() => handleDelete(row.original.puestoId)}
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
        <div className="text-lg">Cargando puestos...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Puestos</h2>
        <Button 
          onClick={handleOpenModal}
          className="transition-all duration-200 hover:scale-105 hover:shadow-lg"
        >
          Nuevo
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <Input
          placeholder="Buscar por descripción..."
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
                  No hay puestos disponibles.
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
          {table.getFilteredRowModel().rows.length} puesto(s) total(es).
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

      <NuevoPuestoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleCreatePuesto}
      />
    </div>
  );
}
