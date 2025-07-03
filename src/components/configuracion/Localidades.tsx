"use client";
import React, { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ImportLocalidadesModal from "@/components/modals/ImportLocalidadesModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
} from "@tanstack/react-table";
import { apiGetLocalidades, apiGetDepartamentos } from "@/services/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

const departamentos = ["Montevideo", "Canelones", "Maldonado"];

export default function Localidades() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [localidades, setLocalidades] = useState<{
    id: number;
    name: string;
    alt_name: string | null;
    place: string;
    population: string | null;
    lat: number;
    lon: number;
  }[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [departamentosState, setDepartamentosState] = useState<{
    departamentoid: string;
    departamentonombre: string;
  }[]>([]);
  const [selectedDepartamento, setSelectedDepartamento] = useState<string>("");

  useEffect(() => {
    const fetchDepartamentos = async () => {
      const data = await apiGetDepartamentos();
      const filteredDepartamentos = data.sdtDepartamentos
        .filter((dep: { DepartamentoEstado: string }) => dep.DepartamentoEstado === "S")
        .map((dep: { DepartamentoId: string; DepartamentoNombre: string }) => ({
          departamentoid: dep.DepartamentoId,
          departamentonombre: dep.DepartamentoNombre,
        }));
      setDepartamentosState(filteredDepartamentos);
    };

    fetchDepartamentos();
  }, []);

  useEffect(() => {
    const fetchLocalidades = async () => {
      if (!selectedDepartamento) return;
      const data = await apiGetLocalidades({ DepartamentoId: selectedDepartamento });
      interface ApiLocalidad {
        LocalidadId: number;
        LocalidadNombre: string;
        LocalidadReferencia?: string;
        LocalidadType: string;
        LocalidadLatitud: string;
        LocalidadLongitud: string;
        LocalidadPoblacion: number | null;
      }

      interface Localidad {
        id: number;
        name: string;
        alt_name: string | null;
        place: string;
        population: string | null;
        lat: number;
        lon: number;
      }

      const mappedLocalidades: Localidad[] = (data.sdtLocalidad as ApiLocalidad[]).map((loc: ApiLocalidad): Localidad => ({
        id: loc.LocalidadId,
        name: loc.LocalidadNombre,
        alt_name: loc.LocalidadReferencia || null,
        place: loc.LocalidadType,
        population: loc.LocalidadPoblacion !== null && loc.LocalidadPoblacion !== undefined ? String(loc.LocalidadPoblacion) : null,
        lat: parseFloat(loc.LocalidadLatitud),
        lon: parseFloat(loc.LocalidadLongitud),
      }));
      setLocalidades(mappedLocalidades);
    };

    fetchLocalidades();
  }, [selectedDepartamento]);

  useEffect(() => {
    const actualizarTabla = () => {
      const fetchLocalidades = async () => {
        if (!selectedDepartamento) return;
        const data = await apiGetLocalidades({ DepartamentoId: selectedDepartamento });
        setLocalidades(data);
      };

      fetchLocalidades();
    };

    window.addEventListener("actualizarTablaLocalidades", actualizarTabla);

    return () => {
      window.removeEventListener("actualizarTablaLocalidades", actualizarTabla);
    };
  }, [selectedDepartamento]);

  const filteredData = useMemo(() => {
    return searchTerm.length > 0
      ? localidades.filter((loc) =>
          loc.name?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : localidades;
  }, [searchTerm, localidades]);

  const columns = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Nombre" },
    { accessorKey: "alt_name", header: "Nombre Alternativo" },
    { accessorKey: "place", header: "Tipo" },
    { accessorKey: "population", header: "Población" },
    { accessorKey: "lat", header: "Latitud" },
    { accessorKey: "lon", header: "Longitud" },
  ];

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Input
          placeholder="Buscar localidades..."
          className="w-1/2 bg-gray-700 text-white"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Select
          value={selectedDepartamento}
          onValueChange={setSelectedDepartamento}
        >
          <SelectTrigger>
            {departamentosState.find(
              (dep) => dep.departamentoid === selectedDepartamento
            )?.departamentonombre || "Seleccione un departamento"}
          </SelectTrigger>
          <SelectContent>
            {departamentosState.map((dep) => (
              <SelectItem key={dep.departamentoid} value={dep.departamentoid}>
                {dep.departamentonombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setIsModalOpen(true)}>Importar</Button>
      </div>
      <ImportLocalidadesModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          if (selectedDepartamento) {
            window.dispatchEvent(new Event("actualizarTablaLocalidades"));
          }
        }}
        departamentos={departamentosState.map((dep) => dep.departamentonombre)}
      />
      <div className="mt-4">
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="text-white">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
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
      </div>
    </div>
  );
}
