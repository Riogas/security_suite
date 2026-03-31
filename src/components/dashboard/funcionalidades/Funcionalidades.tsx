"use client";

import React, { useEffect, useState } from "react";
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
import {
  apiFuncionalidadesDB,
  apiEliminarFuncionalidadDB,
  type FuncionalidadDB,
} from "@/services/api";
import { Pencil, Plus, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function FuncionalidadesTable() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [estado, setEstado] = useState("todos");
  const [esPublico, setEsPublico] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const router = useRouter();

  // debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar esta funcionalidad?")) return;
    setLoading(true);
    try {
      await apiEliminarFuncionalidadDB(id);
      toast.success("Funcionalidad eliminada");
      setPageIndex(0);
    } catch {
      toast.error("Error al eliminar la funcionalidad");
    } finally {
      setLoading(false);
    }
  };

  // load
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await apiFuncionalidadesDB({
          filtro: debouncedSearch,
          estado: estado === "todos" ? undefined : estado,
          esPublico: esPublico ? true : undefined,
          page: pageIndex + 1,
          pageSize,
        });
        setRows(res?.items || []);
        const total = res?.total ?? 0;
        setTotalPages(Math.max(1, Math.ceil(total / pageSize)) || 1);
      } catch (e: any) {
        if (e?.name !== "AbortError")
          console.error("Error cargando funcionalidades:", e);
      }
    })();
    return () => ac.abort();
  }, [debouncedSearch, estado, esPublico, pageIndex, pageSize, loading]);

  const columns: any[] = [
    {
      id: "nombre",
      header: "Funcionalidad",
      cell: ({ row }: { row: { original: FuncionalidadDB } }) =>
        row.original?.nombre ?? "",
    },
    {
      id: "estado",
      header: "Estado",
      cell: ({ row }: { row: { original: FuncionalidadDB } }) => {
        const activo = row.original?.estado === "A";
        return (
          <Badge
            className={
              activo ? "bg-green-900 text-green-200" : "bg-red-900 text-red-200"
            }
          >
            {activo ? "Activo" : "Inactivo"}
          </Badge>
        );
      },
    },
    {
      id: "cantAcciones",
      header: "Cant. Acciones",
      cell: ({ row }: { row: { original: FuncionalidadDB } }) => {
        const c = (row.original as any)?.acciones?.length ?? 0;
        return <span className="tabular-nums font-medium">{c}</span>;
      },
    },
    {
      id: "ops",
      header: "Acciones",
      cell: ({ row }: { row: { original: FuncionalidadDB } }) => (
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              router.push(
                `/dashboard/funcionalidades/editar/${row.original?.id}`,
              )
            }
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={loading}
            onClick={() => handleDelete(row.original?.id)}
          >
            <Trash className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

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
          placeholder="Buscar funcionalidad..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPageIndex(0);
          }}
          className="w-1/2"
        />
        <div className="flex gap-4 items-end">
          <Button onClick={() => router.push("/dashboard/funcionalidades/crear")}>
            <Plus className="w-4 h-4 mr-1" />
            Nueva Funcionalidad
          </Button>
          <div className="flex items-center gap-2">
            <Switch
              checked={esPublico}
              onCheckedChange={(v) => {
                setEsPublico(v);
                setPageIndex(0);
              }}
            />
            <span>Es público</span>
          </div>
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
