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
import { apiListarFuncionalidades, type ListarFuncionalidadesItem } from "@/services/api";
import { Pencil, Trash } from "lucide-react";
import { useRouter } from "next/navigation";

export default function FuncionalidadesTable() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [estado, setEstado] = useState("todos");
  const [sinMigrar, setSinMigrar] = useState(true);
  // Filtros específicos: forzamos FEATURE
  const [esPublico, setEsPublico] = useState(false);
  const tipo = "FEATURE";
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const router = useRouter();

  // debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const fetcher = async (aplicacionId: number = 3, signal?: AbortSignal) => {
    const res = await apiListarFuncionalidades(
      { AplicacionId: aplicacionId },
      { signal }
    );
    
    const items = res?.sdtFuncionalidades || [];
    
    // Filtrar por búsqueda si existe
    const filteredItems = items.filter((item: ListarFuncionalidadesItem) => {
      const matchesSearch = !debouncedSearch || 
        item.FuncionalidadNombre.toLowerCase().includes(debouncedSearch.toLowerCase());
      
      const matchesEstado = estado === "todos" || 
        item.FuncionalidadEstado === estado;
        
      const matchesPublico = !esPublico || 
        item.FuncionalidadEsPublico === "S";
        
      return matchesSearch && matchesEstado && matchesPublico;
    });

    // Agregar conteo de objetos/acciones
    const normalized = filteredItems.map((item: ListarFuncionalidadesItem) => ({
      ...item,
      CantidadObjetos: item.Accion?.length || 0,
    }));

    return { items: normalized, total: normalized.length };
  };

  // load
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const { items, total } = await fetcher(3, ac.signal); // AplicacionId = 3 (GOYA)
        
        // Aplicar paginación manual ya que la API no la soporta
        const startIndex = pageIndex * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedItems = items.slice(startIndex, endIndex);
        
        setRows(paginatedItems);
        setTotalPages(Math.max(1, Math.ceil(total / pageSize)) || 1);
      } catch (e: any) {
        if (e?.name !== "AbortError")
          console.error("Error cargando funcionalidades:", e);
      }
    })();
    return () => ac.abort();
  }, [debouncedSearch, estado, esPublico, pageIndex, pageSize]);

  const columns: any[] = [
    {
      id: "Funcionalidad",
      header: "Funcionalidad",
      cell: ({ row }: { row: { original: ListarFuncionalidadesItem } }) => {
        return row.original?.FuncionalidadNombre ?? "";
      },
    },
    {
      id: "Estado",
      header: "Estado",
      cell: ({ row }: { row: { original: ListarFuncionalidadesItem } }) => {
        const val = row.original?.FuncionalidadEstado;
        const activo = val === "A";
        return (
          <Badge className={activo ? "bg-green-900 text-green-200" : "bg-red-900 text-red-200"}>
            {activo ? "Activo" : "Inactivo"}
          </Badge>
        );
      },
    },
    {
      id: "CantObjetos",
      header: "Cant. Acciones",
      cell: ({ row }: { row: { original: ListarFuncionalidadesItem } }) => {
        const c = row.original?.Accion?.length ?? 0;
        return <span className="tabular-nums font-medium">{c}</span>;
      },
    },
    {
      accessorKey: "acciones",
      header: "Acciones",
      cell: ({ row }: { row: { original: ListarFuncionalidadesItem } }) => (
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/dashboard/funcionalidades/editar/${row.original?.FuncionalidadId}`)}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => console.log("Eliminar funcionalidad", row.original)}
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
          <div className="flex items-center gap-2">
            <Switch
              checked={sinMigrar}
              onCheckedChange={(v) => {
                setSinMigrar(v);
                setPageIndex(0);
              }}
            />
            <span>Sin importar</span>
          </div>
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
              {estado === "A" ? "Activo" : estado === "I" ? "Inactivo" : "Estado"}
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
                    {flexRender(header.column.columnDef.header, header.getContext())}
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
            <Button onClick={() => table.nextPage()} disabled={pageIndex >= table.getPageCount() - 1}>
              ›
            </Button>
            <Button onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={pageIndex >= table.getPageCount() - 1}>
              »
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
