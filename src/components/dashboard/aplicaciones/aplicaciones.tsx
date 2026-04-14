"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { apiAplicacionesDB, apiEliminarAplicacionDB } from "@/services/api";
import { Pencil, Trash, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export type FetcherParams = {
  FiltroTexto: string;
  Pagesize: number;
  CurrentPage: number;
  Estado?: string;
  sinMigrar?: boolean;
  signal?: AbortSignal;
};

export type FetcherResult<T = any> = {
  items: T[];
  total: number; // total de registros (para calcular páginas)
};

export type PaginatedListProps<T = any> = {
  columns?: any[]; // ColumnDef<T, any>[] (opcional)
  fetcher?: (params: FetcherParams) => Promise<FetcherResult<T>>; // opcional
  initialPageSize?: number;
};

export default function AplicacionesTable<T = any>({
  columns: columnsProp,
  fetcher: fetcherProp,
  initialPageSize = 10,
}: PaginatedListProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [estado, setEstado] = useState("todos");
  const [loading, setLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [totalPages, setTotalPages] = useState(0);
  const router = useRouter();

  const handleEdit = (app: any) => {
    const id = app?.id || "";
    if (id) router.push(`/dashboard/aplicaciones/editar/${id}`);
  };
  const handleDelete = async (app: any) => {
    const id = app?.id;
    if (!id) return;
    if (!confirm(`¿Eliminar la aplicación "${app.nombre}"?`)) return;
    try {
      await apiEliminarAplicacionDB(id);
      setRows((prev) => (prev as any[]).filter((r: any) => r.id !== id) as T[]);
      toast.success("Aplicación eliminada");
    } catch {
      toast.error("Error al eliminar la aplicación");
    }
  };

  // Debounce del texto de búsqueda
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Fetcher por defecto usando apiAplicacionesDB (PostgreSQL)
  // Wrapped in useCallback to keep a stable reference and avoid infinite re-render loops
  const defaultFetcher = useCallback(async ({
    FiltroTexto,
    Pagesize,
    CurrentPage,
    Estado,
  }: FetcherParams): Promise<FetcherResult<any>> => {
    const res = await apiAplicacionesDB({
      filtro: FiltroTexto,
      estado: Estado || "",
      page: CurrentPage,
      pageSize: Pagesize,
    });
    const items = res?.items || [];
    const total = Number(res?.total ?? items.length);
    return { items, total };
  }, []);

  // Columnas usando campos PostgreSQL
  const defaultColumns: any[] = [
    { accessorKey: "nombre", header: "Aplicación" },
    { accessorKey: "descripcion", header: "Descripción" },
    { accessorKey: "tecnologia", header: "Tecnología" },
    { accessorKey: "url", header: "URL" },
    {
      accessorKey: "estado",
      header: "Estado",
      cell: ({ row }: { row: { original: any } }) => {
        const activo = row.original?.estado === "A";
        return (
          <Badge className={activo ? "bg-green-900 text-green-200" : "bg-red-900 text-red-200"}>
            {activo ? "Activo" : "Inactivo"}
          </Badge>
        );
      },
    },
    {
      accessorKey: "acciones",
      header: "Acciones",
      cell: ({ row }: { row: { original: any } }) => (
        <div className="space-x-2">
          <Button variant="outline" size="sm" onClick={() => handleEdit(row.original)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant="destructive" size="sm" onClick={() => handleDelete(row.original)}>
            <Trash className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  const columns =
    columnsProp && columnsProp.length > 0 ? columnsProp : defaultColumns;
  // useMemo ensures fetcher reference is stable across renders
  const fetcher = useMemo(
    () => fetcherProp || defaultFetcher,
    [fetcherProp, defaultFetcher],
  );

  // Carga de datos (server-side pagination)
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const res = await fetcher({
          FiltroTexto: debouncedSearch,
          Estado: estado === "A" ? "A" : estado === "I" ? "I" : "",
          sinMigrar: false,
          Pagesize: pageSize,
          CurrentPage: pageIndex + 1,
          signal: ac.signal,
        });
        setRows(res.items || []);
        const total = Number(res.total || 0);
        setTotalPages(Math.max(1, Math.ceil(total / pageSize)) || 0);
      } catch (e: any) {
        if (e?.name !== "AbortError") console.error("Error cargando datos:", e);
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [debouncedSearch, estado, pageIndex, pageSize, fetcher]);

  const table = useReactTable({
    data: rows as any[],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
    state: { pagination: { pageIndex, pageSize } },
    onPaginationChange: (updater: any) => {
      if (typeof updater === "function") {
        const next = updater({ pageIndex, pageSize });
        setPageIndex(next.pageIndex);
        setPageSize(next.pageSize);
      } else {
        setPageIndex(updater.pageIndex);
        setPageSize(updater.pageSize);
      }
    },
  });

  return (
    <div>
      <div className="flex justify-between items-end mb-4">
        <Input
          placeholder="Búsqueda..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPageIndex(0);
          }}
          className="w-1/2"
        />
        <div className="flex gap-4 items-end">
          <Button onClick={() => router.push("/dashboard/aplicaciones/crear")}>
            <Plus className="w-4 h-4 mr-1" /> Nueva Aplicación
          </Button>
          <Select
            value={estado}
            onValueChange={(v) => {
              setEstado(v);
              setPageIndex(0);
            }}
          >
            <SelectTrigger>
              {estado === "A"
                ? "Activo"
                : estado === "I"
                  ? "Inactivo"
                  : "Estado"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A">Activo</SelectItem>
              <SelectItem value="I">Inactivo</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
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
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                const ps = Number(v);
                setPageSize(ps);
                table.setPageSize(ps);
                setPageIndex(0);
              }}
            >
              <SelectTrigger>{pageSize}</SelectTrigger>
              <SelectContent>
                {[10, 25, 50].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span>
            Página {pageIndex + 1} de {table.getPageCount()}
          </span>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => table.setPageIndex(0)}
              disabled={pageIndex === 0}
            >
              «
            </Button>
            <Button
              onClick={() => table.previousPage()}
              disabled={pageIndex === 0}
            >
              ‹
            </Button>
            <Button
              onClick={() => table.nextPage()}
              disabled={pageIndex >= table.getPageCount() - 1}
            >
              ›
            </Button>
            <Button
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={pageIndex >= table.getPageCount() - 1}
            >
              »
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
