"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { apiAccesosDB, apiEliminarAccesoDB, type AccesoDB } from "@/services/api";
import { Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function PermisosTable() {
  const [allRows, setAllRows] = useState<AccesoDB[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const router = useRouter();

  // debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  // load all accesos
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const data = await apiAccesosDB({});
        setAllRows(data);
      } catch (e: any) {
        if (e?.name !== "AbortError")
          console.error("Error cargando accesos:", e);
      }
    })();
    return () => ac.abort();
  }, [loading]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    if (!q) return allRows;
    return allRows.filter(
      (a) =>
        a.funcionalidad?.nombre?.toLowerCase().includes(q) ||
        a.usuario?.username?.toLowerCase().includes(q) ||
        a.usuario?.nombre?.toLowerCase().includes(q) ||
        a.funcionalidad?.aplicacion?.nombre?.toLowerCase().includes(q),
    );
  }, [allRows, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = useMemo(
    () => filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    [filtered, pageIndex, pageSize],
  );

  const handleDelete = async (item: AccesoDB) => {
    if (!confirm(`¿Eliminar acceso de "${item.usuario?.username}" a "${item.funcionalidad?.nombre}"?`)) return;
    setLoading(true);
    try {
      await apiEliminarAccesoDB(item.usuarioId, item.funcionalidadId);
      toast.success("Acceso eliminado");
    } catch {
      toast.error("Error al eliminar el acceso");
    } finally {
      setLoading(false);
    }
  };

  const columns: any[] = [
    {
      id: "funcionalidad",
      header: "Funcionalidad",
      cell: ({ row }: { row: { original: AccesoDB } }) =>
        row.original?.funcionalidad?.nombre ?? "-",
    },
    {
      id: "aplicacion",
      header: "Aplicación",
      cell: ({ row }: { row: { original: AccesoDB } }) =>
        row.original?.funcionalidad?.aplicacion?.nombre ?? "-",
    },
    {
      id: "usuario",
      header: "Usuario",
      cell: ({ row }: { row: { original: AccesoDB } }) => {
        const u = row.original?.usuario;
        return u ? `${u.username}${u.nombre ? ` — ${u.nombre}` : ""}` : "-";
      },
    },
    {
      id: "efecto",
      header: "Efecto",
      cell: ({ row }: { row: { original: AccesoDB } }) => {
        const allow = row.original?.efecto === "ALLOW";
        return (
          <Badge className={allow ? "bg-green-900 text-green-200" : "bg-red-900 text-red-200"}>
            {row.original?.efecto ?? "-"}
          </Badge>
        );
      },
    },
    {
      id: "ops",
      header: "Acciones",
      cell: ({ row }: { row: { original: AccesoDB } }) => (
        <div className="space-x-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={loading}
            onClick={() => handleDelete(row.original)}
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
          placeholder="Buscar acceso..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPageIndex(0);
          }}
          className="w-1/2"
        />
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
            <Button onClick={() => table.setPageIndex(0)} disabled={pageIndex === 0}>
              «
            </Button>
            <Button onClick={() => table.previousPage()} disabled={pageIndex === 0}>
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
