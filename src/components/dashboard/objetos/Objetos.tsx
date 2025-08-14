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
import { apiObjetos } from "@/services/api";
import { Pencil, Trash, Download } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ObjetosTable() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [estado, setEstado] = useState("todos");
  const [sinMigrar, setSinMigrar] = useState(true);
  // Nuevo: filtros adicionales
  const [esPublico, setEsPublico] = useState(false);
  const [tipo, setTipo] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const router = useRouter();

  // debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const fetcher = async (opts: {
    FiltroTexto: string;
    Estado: string;
    sinMigrar: boolean;
    ObjetoEsPublico: "S" | "N";
    ObjetoTipo: string;
    Pagesize: number;
    CurrentPage: number;
    signal?: AbortSignal;
  }) => {
    const res = await apiObjetos(
      {
        FiltroTexto: opts.FiltroTexto,
        Estado: opts.Estado,
        sinMigrar: opts.sinMigrar,
        ObjetoEsPublico: opts.ObjetoEsPublico,
        ObjetoTipo: opts.ObjetoTipo,
        Pagesize: String(opts.Pagesize),
        CurrentPage: String(opts.CurrentPage),
      },
      { signal: opts.signal },
    );
    const items = res?.sdtObjetos || res?.SdtObjetos || res?.items || [];
    const total = Number(
      res?.MaxRegistros ??
        res?.maxRegistros ??
        res?.total ??
        (items?.length || 0),
    );
    // Normalizar para que las columnas existentes funcionen
    const normalized = (items as any[]).map((o: any) => ({
      ...o,
      ObjetoNombre: o?.ObjetoNombre ?? o?.ObjetoLabel ?? o?.ObjetoKey ?? "",
      ObjetoDescripcion: o?.ObjetoDescripcion ?? o?.ObjetoPath ?? "",
    }));
    return { items: normalized, total };
  };

  // load
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const { items, total } = await fetcher({
          FiltroTexto: debouncedSearch,
          Estado: estado === "A" ? "A" : estado === "I" ? "I" : "",
          sinMigrar,
          ObjetoEsPublico: esPublico ? "S" : "N",
          ObjetoTipo: tipo,
          Pagesize: pageSize,
          CurrentPage: pageIndex + 1,
          signal: ac.signal,
        });
        setRows(items);
        setTotalPages(Math.max(1, Math.ceil(Number(total) / pageSize)) || 0);
      } catch (e: any) {
        if (e?.name !== "AbortError")
          console.error("Error cargando objetos:", e);
      }
    })();
    return () => ac.abort();
  }, [
    debouncedSearch,
    estado,
    sinMigrar,
    esPublico,
    tipo,
    pageIndex,
    pageSize,
  ]);

  const columns: any[] = [
    {
      id: "ObjetoNombre",
      header: "Objeto",
      cell: ({ row }: { row: { original: any } }) => {
        const o = row.original || {};
        return o?.ObjetoKey ?? o?.ObjetoLabel ?? "";
      },
    },
    {
      id: "ObjetoPath",
      header: "Path",
      cell: ({ row }: { row: { original: any } }) => {
        const o = row.original || {};
        return o?.ObjetoPath ?? "";
      },
    },
    { accessorKey: "ObjetoTipo", header: "Tipo" },
    {
      accessorKey: "ObjetoEstado",
      header: "Estado",
      cell: ({ row }: { row: { original: any } }) => {
        const val = String(row.original?.ObjetoEstado ?? "").toUpperCase();
        const activo = val === "A" || val === "S" || val === "ACTIVO";
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
      accessorKey: "acciones",
      header: "Acciones",
      cell: ({ row }: { row: { original: any } }) => (
        <div className="space-x-2">
          {sinMigrar && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => console.log("Importar objeto", row.original)}
            >
              <Download className="w-4 h-4" />
              <span className="ml-1">Importar</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              router.push(
                `/dashboard/objetos/editar/${row.original?.ObjetoId || row.original?.id || ""}`,
              )
            }
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => console.log("Eliminar objeto", row.original)}
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
          placeholder="Búsqueda..."
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
          {/* Nuevo: Es publico */}
          <div className="flex items-center gap-2">
            <Switch
              checked={esPublico}
              onCheckedChange={(v) => {
                setEsPublico(v);
                setPageIndex(0);
              }}
            />
            <span>Es publico</span>
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
          {/* Nuevo: Tipo */}
          <Select
            value={tipo}
            onValueChange={(v) => {
              setTipo(v);
              setPageIndex(0);
            }}
          >
            <SelectTrigger>{tipo || "Tipo"}</SelectTrigger>
            <SelectContent>
              {["MENU", "PAGE", "FEATURE"].map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
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
