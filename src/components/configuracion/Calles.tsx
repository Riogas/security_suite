"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectContent,
} from "@/components/ui/select";
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
  ColumnFiltersState,
  getFilteredRowModel,
} from "@tanstack/react-table";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  apiGetCalles,
  apiActualizarEstadoCalle,
  apiGetDepartamentos,
  apiGetLocalidades,
} from "@/services/api";
import { toast } from "sonner";

// Tipos
interface Departamento {
  DepartamentoId: number;
  DepartamentoNombre: string;
  DepartamentoEstado: string;
}
interface Localidad {
  LocalidadId: number;
  LocalidadNombre: string;
  LocalidadEstado: string;
}
interface Calle {
  CalleId: number;
  CalleNombre: string;
  CalleEstado: string;
}

// Filtro múltiple
const multiValueFilter = (row: any, columnId: string, filterValue: string[]) => {
  if (!Array.isArray(filterValue)) return true;
  return filterValue.includes(row.getValue(columnId));
};

export default function Calles() {
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [selectedDepartamento, setSelectedDepartamento] = useState<number | null>(null);
  const [selectedLocalidad, setSelectedLocalidad] = useState<number | null>(null);
  const [calles, setCalles] = useState<Calle[]>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [nombreFiltro, setNombreFiltro] = useState<string[]>([]);
  const [nombreSearch, setNombreSearch] = useState("");

  useEffect(() => {
    apiGetDepartamentos().then((res) => {
      toast.success("Departamentos cargados correctamente");
      const activos = res.sdtDepartamentos.filter((d: any) => d.DepartamentoEstado === "S");
      setDepartamentos(
        activos.map((d: any) => ({
          DepartamentoId: Number(d.DepartamentoId),
          DepartamentoNombre: d.DepartamentoNombre,
          DepartamentoEstado: d.DepartamentoEstado,
        }))
      );
    }).catch(() => {
      toast.error("Error al cargar departamentos");
    });
  }, []);

  useEffect(() => {
    if (selectedDepartamento) {
      apiGetLocalidades({ DepartamentoId: selectedDepartamento.toString() }).then((res) => {
        const activos = res.sdtLocalidad.filter((l: any) => l.LocalidadEstado === "S");
        setLocalidades(
          activos.map((l: any) => ({
            LocalidadId: Number(l.LocalidadId),
            LocalidadNombre: l.LocalidadNombre,
            LocalidadEstado: l.LocalidadEstado,
          }))
        );
      }).catch(() => {
        toast.error("Error al cargar localidades");
      });
    }
  }, [selectedDepartamento]);

  useEffect(() => {
    if (selectedDepartamento) {
      const toastId = toast.loading("Cargando calles...");
      apiGetCalles({
        DepartamentoId: selectedDepartamento,
        LocalidadId: selectedLocalidad || 0,
      })
        .then((res) => {
          toast.success("Calles cargadas correctamente", { id: toastId });
          setCalles(res.sdtCalles || []);
        })
        .catch(() => {
          toast.error("Error al cargar calles", { id: toastId });
        });
    }
  }, [selectedDepartamento, selectedLocalidad]);

  const nombresUnicos = useMemo(
    () => Array.from(new Set(calles.map((c) => c.CalleNombre))),
    [calles]
  );

  const updateColumnFilter = (columnId: string, values: string[]) => {
    setColumnFilters((prev) => {
      if (values.length === 0) return prev.filter((f) => f.id !== columnId);
      const existing = prev.find((f) => f.id === columnId);
      if (existing) {
        return prev.map((f) => (f.id === columnId ? { ...f, value: values } : f));
      }
      return [...prev, { id: columnId, value: values }];
    });
  };

  const columns = [
    {
      accessorKey: "CalleNombre",
      header: "Nombre",
      filterFn: multiValueFilter,
      cell: (info: any) => info.getValue(),
    },
    {
      accessorKey: "CalleNombreLargo",
      header: "Nombre Completo",
      cell: (info: any) => info.getValue(),
    },
    {
      accessorKey: "CalleEstado",
      header: "Estado",
      cell: ({ row }: any) => {
        const [popoverOpen, setPopoverOpen] = useState(false);
        const estado = row.original.CalleEstado;
        const id = row.original.CalleNombre; // Usar el nombre como identificador
        const nuevoEstado = estado === "S" ? "N" : "S";

        const cambiarEstado = async () => {
          try {
            toast("Actualizando estado de la calle...");
            await apiActualizarEstadoCalle({ CalleId: id, CalleEstado: nuevoEstado });
            const updated = await apiGetCalles({
              DepartamentoId: selectedDepartamento!,
              LocalidadId: selectedLocalidad || 0,
            });
            toast.success("Estado de la calle actualizado correctamente");
            setCalles(updated.sdtCalles || []);
            setPopoverOpen(false);
          } catch (err) {
            toast.error("Error al actualizar estado de la calle");
            console.error("Error al actualizar calle:", err);
          }
        };

        return (
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Badge
                className={`cursor-pointer ${estado === "S" ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}
              >
                {estado === "S" ? "Activo" : "Pasivo"}
              </Badge>
            </PopoverTrigger>
            <PopoverContent>
              <div className="flex flex-col gap-2">
                <Button onClick={cambiarEstado}>
                  {nuevoEstado === "S" ? "Activo" : "Pasivo"}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        );
      },
    },
  ];

  const table = useReactTable({
    data: calles,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Input placeholder="Buscar calles..." className="w-1/2 bg-gray-700 text-white" />
        <Button onClick={() => console.log("Importar")}>Importar</Button>
      </div>

      <div className="flex gap-4 mb-4">
        <Select value={selectedDepartamento?.toString() || ""} onValueChange={(v) => setSelectedDepartamento(Number(v))}>
          <SelectTrigger>
            {departamentos.find((d) => d.DepartamentoId === selectedDepartamento)?.DepartamentoNombre || "Departamento"}
          </SelectTrigger>
          <SelectContent>
            {departamentos.map((d) => (
              <SelectItem key={d.DepartamentoId} value={d.DepartamentoId.toString()}>
                {d.DepartamentoNombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedLocalidad === null ? "__todos__" : selectedLocalidad?.toString()} onValueChange={(v) => setSelectedLocalidad(v === "__todos__" ? null : Number(v))} disabled={!selectedDepartamento}>
          <SelectTrigger>
            {localidades.find((l) => l.LocalidadId === selectedLocalidad)?.LocalidadNombre || "Localidad"}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__todos__">Todos</SelectItem>
            {localidades.map((l) => (
              <SelectItem key={l.LocalidadId} value={l.LocalidadId.toString()}>
                {l.LocalidadNombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.column.id === "CalleNombre" ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="flex items-center gap-2">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            ▾
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 max-h-96 overflow-auto">
                          <Input
                            placeholder="Buscar nombre..."
                            value={nombreSearch}
                            onChange={(e) => setNombreSearch(e.target.value)}
                            className="mb-2"
                          />
                          {nombresUnicos
                            .filter((n) => n.toLowerCase().includes(nombreSearch.toLowerCase()))
                            .slice(0, 20) // Limitar a 20 resultados
                            .map((nombre) => (
                              <label key={nombre} className="flex items-center gap-2 cursor-pointer">
                                <Checkbox
                                  checked={nombreFiltro.includes(nombre)}
                                  onCheckedChange={(checked) => {
                                    const actualizados = checked
                                      ? [...nombreFiltro, nombre]
                                      : nombreFiltro.filter((n) => n !== nombre);
                                    setNombreFiltro(actualizados);
                                    updateColumnFilter("CalleNombre", actualizados);
                                  }}
                                />
                                <span>{nombre}</span>
                              </label>
                            ))}
                        </PopoverContent>
                      </Popover>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
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
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
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
            Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
          </span>
          <div className="flex gap-2">
            <Button onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>«</Button>
            <Button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>‹</Button>
            <Button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>›</Button>
            <Button onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>»</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
