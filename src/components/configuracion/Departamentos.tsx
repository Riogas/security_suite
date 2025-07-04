"use client";
import React, { useEffect, useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ImportDepartamentosModal from "@/components/modals/ImportDepartamentosModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  apiGetDepartamentos,
  apiImportarDepartamentos,
  apiCambiarEstadoDepartamento,
} from "@/services/api";
import { toast } from "sonner";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { debounce } from "lodash";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

export default function Departamentos() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [departamentos, setDepartamentos] = useState<
    {
      departamentoid: string;
      departamentonombre: string;
      departamentoestado: string;
    }[]
  >([]);
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    apiGetDepartamentos().then((data) => {
      const mappedData = data.sdtDepartamentos.map(
        (dep: {
          DepartamentoId: string;
          DepartamentoNombre: string;
          DepartamentoEstado: string;
        }) => ({
          departamentoid: dep.DepartamentoId,
          departamentonombre: dep.DepartamentoNombre,
          departamentoestado:
            dep.DepartamentoEstado === "S" ? "Activo" : "Pasivo",
        }),
      );
      setDepartamentos(mappedData);
    });
  }, []);

  useEffect(() => {
    const actualizarTabla = () => {
      apiGetDepartamentos().then((data) => {
        const mappedData = data.sdtDepartamentos.map(
          (dep: {
            DepartamentoId: string;
            DepartamentoNombre: string;
            DepartamentoEstado: string;
          }) => ({
            departamentoid: dep.DepartamentoId,
            departamentonombre: dep.DepartamentoNombre,
            departamentoestado:
              dep.DepartamentoEstado === "S" ? "Activo" : "Pasivo",
          }),
        );
        setDepartamentos(mappedData);
      });
    };

    window.addEventListener("actualizarTablaDepartamentos", actualizarTabla);

    return () => {
      window.removeEventListener(
        "actualizarTablaDepartamentos",
        actualizarTabla,
      );
    };
  }, []);

  const importar = async () => {
    const seleccionadosData = departamentos.filter((dep) =>
      seleccionados.includes(dep.departamentonombre),
    );
    if (seleccionadosData.length === 0) {
      toast.error("Debe seleccionar al menos un departamento para importar.");
      return;
    }
    // Formatear al formato requerido
    const body = {
      sdtDepartamentos: seleccionadosData.map((dep) => ({
        DepartamentoId: dep.departamentoid,
        DepartamentoNombre: dep.departamentonombre,
      })),
    };
    console.log("JSON a importar:", JSON.stringify(body, null, 2));
    try {
      const response = await apiImportarDepartamentos(body);
      toast.success("Departamentos importados correctamente.");
      console.log("Respuesta de la API:", response);
    } catch (error) {
      console.error("Error al importar departamentos:", error);
      toast.error(
        "Error al importar departamentos. Consulte la consola para más detalles.",
      );
    }
  };

  const debouncedSearchTerm = useMemo(
    () => debounce((term: string) => term, 100),
    [],
  );

  const filteredData = useMemo(() => {
    return searchTerm.length >= 0
      ? departamentos.filter((dep) =>
          dep.departamentonombre
            .toLowerCase()
            .includes((debouncedSearchTerm(searchTerm) ?? "").toLowerCase()),
        )
      : departamentos;
  }, [searchTerm, departamentos]);

  const columns = [
    { accessorKey: "departamentoid", header: "Identificador" },
    { accessorKey: "departamentonombre", header: "Departamento" },
    {
      accessorKey: "departamentoestado",
      header: "Estado",
      cell: ({
        row,
      }: {
        row: {
          original: { departamentoid: string; departamentoestado: string };
        };
      }) => (
        <Popover>
          <PopoverTrigger>
            <Badge
              className={
                row.original.departamentoestado === "Activo"
                  ? "bg-green-900 text-green-200"
                  : "bg-red-900 text-red-200"
              }
            >
              {row.original.departamentoestado}
            </Badge>
          </PopoverTrigger>
          <PopoverContent className="w-32 p-2">
            <div className="flex flex-col">
              <button
                className="text-left px-2 py-1 hover:bg-secondary"
                onClick={async () => {
                  const nuevoEstado =
                    row.original.departamentoestado === "Activo" ? "N" : "S";
                  try {
                    const response = await apiCambiarEstadoDepartamento(
                      row.original.departamentoid,
                      nuevoEstado,
                    );
                    if (response.Code === 0) {
                      const estadoActualizado =
                        nuevoEstado === "S" ? "Activo" : "Pasivo";
                      toast.success(
                        `Estado actualizado correctamente a ${estadoActualizado}`,
                      );

                      // Actualizar el estado de la tabla después de mostrar el toast
                      setDepartamentos((prev) =>
                        prev.map((dep) =>
                          dep.departamentoid === row.original.departamentoid
                            ? { ...dep, departamentoestado: estadoActualizado }
                            : dep,
                        ),
                      );

                      // Agregar un pequeño retraso antes de cerrar el Popover
                      setTimeout(() => {
                        console.log(
                          "Popover cerrado después de actualizar el estado.",
                        );
                      }, 300);
                    } else {
                      toast.error(
                        "Error al actualizar el estado. Consulte la consola para más detalles.",
                      );
                    }
                  } catch (error) {
                    console.error("Error al cambiar estado:", error);
                    toast.error(
                      "Error al cambiar estado. Consulte la consola para más detalles.",
                    );
                  }
                }}
              >
                {row.original.departamentoestado === "Activo"
                  ? "Pasivo"
                  : "Activo"}
              </button>
            </div>
          </PopoverContent>
        </Popover>
      ),
    },
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
          placeholder="Buscar departamentos..."
          className="w-1/2"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button className="ml-4" onClick={() => setIsModalOpen(true)}>
          Importar
        </Button>
      </div>
      <ImportDepartamentosModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
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
                        header.getContext(),
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
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
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
