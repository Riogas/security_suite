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
  getFilteredRowModel,
  FilterFnOption,
  ColumnFiltersState,
  FilterFn,
} from "@tanstack/react-table";
import {
  apiGetLocalidades,
  apiGetDepartamentos,
  apiActualizarEstadoLocalidad,
} from "@/services/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

const departamentos = ["Montevideo", "Canelones", "Maldonado"];

const multiValueFilter: FilterFn<any> = (row, columnId, filterValue) => {
  if (!Array.isArray(filterValue)) return true;
  return filterValue.includes(row.getValue(columnId));
};

export default function Localidades() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [localidades, setLocalidades] = useState<
    {
      id: number;
      name: string;
      alt_name: string | null;
      place: string;
      population: string | null;
      lat: number;
      lon: number;
      estado: string; // Include estado
    }[]
  >([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [departamentosState, setDepartamentosState] = useState<
    {
      departamentoid: string;
      departamentonombre: string;
    }[]
  >([]);
  const [selectedDepartamento, setSelectedDepartamento] = useState<string>("");
  const [selectedEstado, setSelectedEstado] = useState<string>("");

  const [nombreFiltro, setNombreFiltro] = useState<string[]>([]);
  const [tipoFiltro, setTipoFiltro] = useState<string[]>([]);
  const [altNameFiltro, setAltNameFiltro] = useState<string[]>([]);
  const [nombreSearch, setNombreSearch] = useState("");

  const [filteredLocalidades, setFilteredLocalidades] = useState(localidades);

  useEffect(() => {
    const fetchDepartamentos = async () => {
      const data = await apiGetDepartamentos();
      const filteredDepartamentos = data.sdtDepartamentos
        .filter(
          (dep: { DepartamentoEstado: string }) =>
            dep.DepartamentoEstado === "S",
        )
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
      try {
        const data = await apiGetLocalidades({
          DepartamentoId: selectedDepartamento,
        });
        const mappedLocalidades = (data.sdtLocalidad || []).map((loc: any) => ({
          id: loc.LocalidadId,
          name: loc.LocalidadNombre,
          alt_name: loc.LocalidadReferencia || null,
          place: loc.LocalidadTipo || loc.LocalidadType || "Desconocido",
          population:
            loc.LocalidadPoblacion !== null &&
            loc.LocalidadPoblacion !== undefined
              ? String(loc.LocalidadPoblacion)
              : null,
          lat: parseFloat(loc.LocalidadLatitud),
          lon: parseFloat(loc.LocalidadLongitud),
          estado: loc.LocalidadEstado,
        }));
        setLocalidades(mappedLocalidades);
      } catch (error) {
        console.error("Error fetching localidades:", error);
        setLocalidades([]); // Fallback to empty array
      }
    };

    fetchLocalidades();
  }, [selectedDepartamento]);

  useEffect(() => {
    const actualizarTabla = () => {
      const fetchLocalidades = async () => {
        if (!selectedDepartamento) return;
        const data = await apiGetLocalidades({
          DepartamentoId: selectedDepartamento,
        });
        setLocalidades(
          (data.sdtLocalidad || []).map((loc: any) => ({
            id: loc.LocalidadId,
            name: loc.LocalidadNombre,
            alt_name: loc.LocalidadReferencia || null,
            place: loc.LocalidadTipo || loc.LocalidadType || "Desconocido",
            population:
              loc.LocalidadPoblacion !== null &&
              loc.LocalidadPoblacion !== undefined
                ? String(loc.LocalidadPoblacion)
                : null,
            lat: parseFloat(loc.LocalidadLatitud),
            lon: parseFloat(loc.LocalidadLongitud),
            estado: loc.LocalidadEstado,
          })),
        );
      };

      fetchLocalidades();
    };

    window.addEventListener("actualizarTablaLocalidades", actualizarTabla);

    return () => {
      window.removeEventListener("actualizarTablaLocalidades", actualizarTabla);
    };
  }, [selectedDepartamento]);

  useEffect(() => {
    const applyEstadoFilter = () => {
      if (selectedEstado === "Todos") {
        setFilteredLocalidades(localidades);
      } else {
        const filtered = localidades.filter((loc) =>
          selectedEstado === "S" ? loc.estado === "S" : loc.estado !== "S"
        );
        setFilteredLocalidades(filtered);
      }
    };

    applyEstadoFilter();
  }, [localidades, selectedEstado]);

  const filteredData = useMemo(() => {
    return searchTerm.length > 0
      ? localidades.filter((loc) =>
          loc.name?.toLowerCase().includes(searchTerm.toLowerCase()),
        )
      : localidades;
  }, [searchTerm, localidades]);

  const tiposUnicos = useMemo(() => {
    if (!Array.isArray(localidades)) return [];
    return Array.from(new Set(localidades.map((loc) => loc.place)));
  }, [localidades]);
  const nombresUnicos = useMemo(
    () => Array.from(new Set(localidades.map((loc) => loc.name))),
    [localidades],
  );
  const altNamesUnicos = useMemo(() => {
    return Array.from(new Set(localidades.map((loc) => loc.alt_name || "N/A")));
  }, [localidades]);

  const localidadesFiltradas = useMemo(() => {
    return localidades.filter((loc) => {
      const tipoOk =
        tipoFiltro.length > 0 ? tipoFiltro.includes(loc.place) : true;
      const nombreOk =
        nombreFiltro.length > 0 ? nombreFiltro.includes(loc.name) : true;
      const altNameOk =
        altNameFiltro.length > 0
          ? altNameFiltro.includes(loc.alt_name || "N/A")
          : true;
      return tipoOk && nombreOk && altNameOk;
    });
  }, [localidades, tipoFiltro, nombreFiltro, altNameFiltro]);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const columns = [
    {
      accessorKey: "id",
      header: "ID",
    },
    {
      accessorKey: "name",
      header: "Nombre",
      filterFn: multiValueFilter,
    },
    {
      accessorKey: "estado",
      header: "Estado",
      cell: ({
        row,
      }: {
        row: { original: { estado: string; id: number } };
      }) => {
        const [popoverOpen, setPopoverOpen] = useState(false);
        const localidadId = row.original.id;
        const currentEstado = row.original.estado;
        const oppositeEstado = currentEstado === "S" ? "N" : "S";

        const handleEstadoChange = async () => {
          try {
            await apiActualizarEstadoLocalidad({
              LocalidadId: localidadId,
              LocalidadEstado: oppositeEstado,
            });
            setPopoverOpen(false);
            const event = new Event("actualizarTablaLocalidades");
            window.dispatchEvent(event);
          } catch (error) {
            console.error("Failed to update localidad state", error);
            alert("Error updating state. Please try again.");
          }
        };

        return (
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Badge
                className={`cursor-pointer ${currentEstado === "S" ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}
              >
                {currentEstado === "S" ? "Activo" : "Pasivo"}
              </Badge>
            </PopoverTrigger>
            <PopoverContent>
              <div className="flex flex-col gap-2">
                <Button variant="default" onClick={handleEstadoChange}>
                  {oppositeEstado === "S" ? "Activo" : "Pasivo"}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        );
      },
    },
    {
      accessorKey: "alt_name",
      header: "Nombre Alternativo",
      filterFn: multiValueFilter,
    },
    {
      accessorKey: "place",
      header: "Tipo",
      filterFn: multiValueFilter,
    },
    {
      accessorKey: "population",
      header: "Población",
    },
    {
      accessorKey: "lat",
      header: "Latitud",
    },
    {
      accessorKey: "lon",
      header: "Longitud",
    },
  ];

  const table = useReactTable({
    data: filteredLocalidades,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      columnFilters,
    },
    onColumnFiltersChange: setColumnFilters,
  });

  const updateColumnFilter = (columnId: string, values: string[]) => {
    setColumnFilters((prev) => {
      if (values.length === 0) {
        // Remove the filter if no values are selected
        return prev.filter((filter) => filter.id !== columnId);
      }
      const existingFilter = prev.find((filter) => filter.id === columnId);
      if (existingFilter) {
        return prev.map((filter) =>
          filter.id === columnId ? { ...filter, value: values } : filter,
        );
      }
      return [...prev, { id: columnId, value: values }];
    });
  };

  const handleEstadoChange = async (
    localidadId: number,
    currentEstado: string,
  ) => {
    const nuevoEstado = currentEstado === "S" ? "P" : "S"; // Toggle between 'S' (Activo) and 'P' (Pasivo)

    try {
      await apiActualizarEstadoLocalidad({
        LocalidadId: localidadId,
        LocalidadEstado: nuevoEstado,
      });
      const data = await apiGetLocalidades({
        DepartamentoId: selectedDepartamento,
      });
      const mappedLocalidades = data.sdtLocalidad.map((loc: any) => ({
        id: loc.LocalidadId,
        name: loc.LocalidadNombre,
        alt_name: loc.LocalidadReferencia || null,
        place: loc.LocalidadTipo || loc.LocalidadType || "Desconocido",
        population:
          loc.LocalidadPoblacion !== null &&
          loc.LocalidadPoblacion !== undefined
            ? String(loc.LocalidadPoblacion)
            : null,
        lat: parseFloat(loc.LocalidadLatitud),
        lon: parseFloat(loc.LocalidadLongitud),
        estado: loc.LocalidadEstado, // Include estado
      }));
      setLocalidades(mappedLocalidades);
    } catch (error) {
      console.error("Error updating localidad state:", error);
    }
  };

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
              (dep) => dep.departamentoid === selectedDepartamento,
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
        <Select
          value={selectedEstado || "S"}
          onValueChange={(value) => setSelectedEstado(value)}
        >
          <SelectTrigger>
            {selectedEstado === "S" ? "Activo" : selectedEstado === "N" ? "Pasivo" : "Todos"}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="S">Activo</SelectItem>
            <SelectItem value="N">Pasivo</SelectItem>
            <SelectItem value="Todos">Todos</SelectItem>
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
                      {header.isPlaceholder ? null : (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex items-center gap-2"
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                              ▾
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 max-h-96 overflow-auto">
                            {header.column.id === "name" && (
                              <div>
                                <input
                                  type="text"
                                  placeholder="Buscar nombre..."
                                  value={nombreSearch}
                                  onChange={(e) =>
                                    setNombreSearch(e.target.value)
                                  }
                                  className="mb-2 w-full rounded border px-2 py-1 text-sm bg-background text-foreground"
                                />
                                <div className="flex flex-col gap-1">
                                  {nombresUnicos
                                    .filter((nombre) =>
                                      nombre
                                        .toLowerCase()
                                        .includes(nombreSearch.toLowerCase()),
                                    )
                                    .map((nombre) => (
                                      <label
                                        key={nombre}
                                        className="flex items-center gap-2 cursor-pointer"
                                      >
                                        <Checkbox
                                          checked={nombreFiltro.includes(
                                            nombre,
                                          )}
                                          onCheckedChange={(checked) => {
                                            const updatedFiltro = checked
                                              ? [...nombreFiltro, nombre]
                                              : nombreFiltro.filter(
                                                  (n) => n !== nombre,
                                                );
                                            setNombreFiltro(updatedFiltro);
                                            updateColumnFilter(
                                              "name",
                                              updatedFiltro,
                                            );
                                          }}
                                        />
                                        <span>{nombre}</span>
                                      </label>
                                    ))}
                                </div>
                              </div>
                            )}
                            {header.column.id === "alt_name" && (
                              <div>
                                <input
                                  type="text"
                                  placeholder="Buscar nom. alt..."
                                  value={nombreSearch}
                                  onChange={(e) =>
                                    setNombreSearch(e.target.value)
                                  }
                                  className="mb-2 w-full rounded border px-2 py-1 text-sm bg-background text-foreground"
                                />
                                <div className="flex flex-col gap-1">
                                  {altNamesUnicos
                                    .filter((altName) =>
                                      altName
                                        .toLowerCase()
                                        .includes(nombreSearch.toLowerCase()),
                                    )
                                    .map((altName) => (
                                      <label
                                        key={altName}
                                        className="flex items-center gap-2 cursor-pointer"
                                      >
                                        <Checkbox
                                          checked={altNameFiltro.includes(
                                            altName,
                                          )}
                                          onCheckedChange={(checked) => {
                                            const updatedFiltro = checked
                                              ? [...altNameFiltro, altName]
                                              : altNameFiltro.filter(
                                                  (n) => n !== altName,
                                                );
                                            setAltNameFiltro(updatedFiltro);
                                            updateColumnFilter(
                                              "alt_name",
                                              updatedFiltro,
                                            );
                                          }}
                                        />
                                        <span>{altName}</span>
                                      </label>
                                    ))}
                                </div>
                              </div>
                            )}
                            {header.column.id === "place" && (
                              <div className="flex flex-col gap-1">
                                {tiposUnicos.map((tipo) => (
                                  <label
                                    key={tipo}
                                    className="flex items-center gap-2 cursor-pointer"
                                  >
                                    <Checkbox
                                      checked={tipoFiltro.includes(tipo)}
                                      onCheckedChange={(checked) => {
                                        const updatedFiltro = checked
                                          ? [...tipoFiltro, tipo]
                                          : tipoFiltro.filter(
                                              (t) => t !== tipo,
                                            );
                                        setTipoFiltro(updatedFiltro);
                                        updateColumnFilter(
                                          "place",
                                          updatedFiltro,
                                        );
                                      }}
                                    />
                                    <span>{tipo}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
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
