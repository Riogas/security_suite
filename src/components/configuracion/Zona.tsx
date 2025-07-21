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

// Reemplaza esto por tu API real
// import { apiGetZonas, apiABMZona } from "@/services/api";

interface Zona {
  id: string;
  tipoCapa: string;
  capa: string;
  zona: string;
  estado: string;
  geojson: any;
}

export default function Zona() {
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  useEffect(() => {
    const fetchZonas = async () => {
      try {
        setLoading(true);
        // const data = await apiGetZonas();
        // setZonas(data);
        // MOCK DATA
        setZonas([
          {
            id: "1",
            tipoCapa: "Tipo 1",
            capa: "Capa A",
            zona: "Zona X",
            estado: "A",
            geojson: {},
          },
          {
            id: "2",
            tipoCapa: "Tipo 2",
            capa: "Capa B",
            zona: "Zona Y",
            estado: "P",
            geojson: {},
          },
        ]);
      } catch (error) {
        setZonas([]);
      } finally {
        setLoading(false);
      }
    };
    fetchZonas();
  }, []);

  const debouncedSearchTerm = useMemo(
    () => debounce((term: string) => term, 100),
    [],
  );

  const filteredData = useMemo(() => {
    return searchTerm.length >= 0
      ? zonas.filter((zona) =>
          zona.zona
            .toLowerCase()
            .includes((debouncedSearchTerm(searchTerm) ?? "").toLowerCase()),
        )
      : zonas;
  }, [searchTerm, zonas]);

  const handleEdit = (id: string) => {
    // TODO: Implementar funcionalidad de edición
    alert(`Editando zona: ${id}`);
  };

  const handleDelete = (id: string) => {
    // TODO: Implementar funcionalidad de eliminación
    alert(`Eliminando zona: ${id}`);
  };

  const handleShowMap = (geojson: any) => {
    // TODO: Mostrar modal/mapa con el geojson
    alert("Mostrar mapa (GeoJSON): " + JSON.stringify(geojson));
  };

  // TODO: Implementar modal de creación
  const handleCreateZona = async (/* ... */) => {
    // ...
  };

  const columns = [
    { accessorKey: "tipoCapa", header: "Tipo Capa" },
    { accessorKey: "capa", header: "Capa" },
    { accessorKey: "zona", header: "Zona" },
    {
      accessorKey: "estado",
      header: "Estado",
      cell: ({ row }: { row: { original: Zona } }) => (
        <Badge
          className={
            row.original.estado === "A"
              ? "bg-green-100 text-green-800 border-green-300"
              : "bg-red-100 text-red-800 border-red-300"
          }
        >
          {row.original.estado === "A" ? "Activo" : "Pasivo"}
        </Badge>
      ),
    },
    {
      id: "mapa",
      header: "",
      cell: ({ row }: { row: { original: Zona } }) => (
        <Button variant="ghost" size="icon" onClick={() => handleShowMap(row.original.geojson)}>
          <MapPin className="h-5 w-5 text-blue-600" />
        </Button>
      ),
    },
    {
      id: "acciones",
      header: "Acciones",
      cell: ({ row }: { row: { original: Zona } }) => (
        <div className="flex space-x-2">
          <button
            onClick={() => handleEdit(row.original.id)}
            className="p-1 hover:bg-gray-100 rounded transition-colors duration-200"
          >
            <Edit className="h-4 w-4 text-blue-600 hover:text-blue-800" />
          </button>
          <button
            onClick={() => handleDelete(row.original.id)}
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
        <div className="text-lg">Cargando zonas...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Zonas</h2>
        <Button 
          onClick={handleOpenModal}
          className="transition-all duration-200 hover:scale-105 hover:shadow-lg"
        >
          Nueva
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <Input
          placeholder="Buscar por zona..."
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
                  No hay zonas disponibles.
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
          {table.getFilteredRowModel().rows.length} zona(s) total(es).
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

      {/* Modal de creación aquí si lo necesitas */}
    </div>
  );
}
