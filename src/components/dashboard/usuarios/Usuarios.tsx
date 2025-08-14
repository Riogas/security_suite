"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { Pencil, Trash, Download } from "lucide-react";
import { debounce } from "lodash";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
} from "@tanstack/react-table";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiUsuarios } from "@/services/api";

// Tipo local para las filas de la tabla
type UsuarioRow = {
  usuario: string;
  nombre: string;
  mail: string;
  estado: "A" | "I";
  fchUltLogin: string;
  tipoUsuario: "G" | "L" | string;
  externo: boolean;
};

export default function UsuariosTable() {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [estado, setEstado] = useState("todos");
  const [externo, setExterno] = useState(false);
  const [tipoUsuario, setTipoUsuario] = useState("todos");
  const [sinMigrar, setSinMigrar] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);

  const handleImport = (u: UsuarioRow) => {
    // TODO: implementar acción de importación
    console.log("Importar usuario:", u.usuario);
  };

  // Cargar datos desde API (server-side pagination)
  useEffect(() => {
    const fetchUsuarios = async () => {
      try {
        const body = {
          IncluyeExternos: externo,
          sinMigrar: sinMigrar,
          FiltroTexto: searchTerm,
          TipoUsuario: tipoUsuario === "todos" ? "" : tipoUsuario,
          Estado: estado === "A" ? "S" : estado === "I" ? "N" : "",
          Pagesize: String(pageSize),
          CurrentPage: String(pageIndex + 1),
        };
        const res = await apiUsuarios(body);
        const rows: UsuarioRow[] = (res?.SdtUsuarios || []).map((u: any) => {
          const fch = u?.UserExtendedFchUltLog as string | undefined;
          const fchFmt =
            fch && fch !== "0000-00-00T00:00:00"
              ? fch.replace("T", " ").slice(0, 16)
              : "";
          const externoStr = String(
            u?.UserExtendedExterno || u?.UserExtendedUserExterno || "",
          ).toUpperCase();
          const estadoRaw = String(u?.UserExtendedEstado || "").toUpperCase();
          const activo =
            estadoRaw === "S" || estadoRaw === "A" || estadoRaw === "ACTIVO";
          return {
            usuario: u?.UserExtendedUserName || "",
            nombre: u?.UserExtendedNombre || "",
            mail: u?.UserExtendedEmail || "",
            estado: (activo ? "A" : "I") as "A" | "I",
            fchUltLogin: fchFmt,
            tipoUsuario: (u?.UserExtendedTipoUser || "") as "G" | "L" | string,
            externo:
              externoStr === "S" ||
              externoStr === "Y" ||
              externoStr === "1" ||
              externoStr === "TRUE",
          } as UsuarioRow;
        });
        setUsuarios(rows);
        const total = Number(res?.MaxRegistros ?? 0);
        setTotalPages(Math.max(1, Math.ceil(total / pageSize)) || 0);
      } catch (e) {
        console.error("Error cargando usuarios:", e);
      }
    };
    fetchUsuarios();
  }, [
    searchTerm,
    estado,
    externo,
    tipoUsuario,
    pageIndex,
    pageSize,
    sinMigrar,
  ]);

  // Filtros
  const debouncedSearchTerm = useMemo(() => debounce((term) => term, 100), []);
  const filteredData = useMemo(() => {
    return usuarios.filter((u) => {
      const matchesSearch =
        searchTerm === "" ||
        Object.values(u)
          .join(" ")
          .toLowerCase()
          .includes((debouncedSearchTerm(searchTerm) ?? "").toLowerCase());
      const matchesEstado = estado === "todos" || u.estado === estado;
      const matchesExterno = !externo || u.externo === externo;
      const matchesTipo =
        tipoUsuario === "todos" || u.tipoUsuario === tipoUsuario;
      return matchesSearch && matchesEstado && matchesExterno && matchesTipo;
    });
  }, [searchTerm, estado, externo, tipoUsuario, usuarios, debouncedSearchTerm]);

  // Columnas para react-table
  const columns = [
    { accessorKey: "usuario", header: "Usuario" },
    { accessorKey: "nombre", header: "Nombre" },
    { accessorKey: "mail", header: "Mail" },
    {
      accessorKey: "estado",
      header: "Estado",
      cell: ({ row }: { row: { original: UsuarioRow } }) => (
        <Badge
          className={
            row.original.estado === "A"
              ? "bg-green-900 text-green-200"
              : "bg-red-900 text-red-200"
          }
        >
          {row.original.estado === "A" ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    { accessorKey: "fchUltLogin", header: "Fch Ult Login" },
    {
      accessorKey: "tipoUsuario",
      header: "Tipo Usuario",
      cell: ({ row }: { row: { original: UsuarioRow } }) =>
        row.original.tipoUsuario === "G"
          ? "Global"
          : row.original.tipoUsuario === "L"
            ? "Local"
            : "",
    },
    {
      accessorKey: "acciones",
      header: "Acciones",
      cell: ({ row }: { row: { original: UsuarioRow } }) => (
        <div className="space-x-2">
          {sinMigrar && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleImport(row.original)}
            >
              <Download className="w-4 h-4" />
              <span className="ml-1">Importar</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              router.push(`/dashboard/usuarios/editar/${row.original.usuario}`)
            }
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant="destructive" size="sm">
            <Trash className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  // react-table (server-side pagination)
  const table = useReactTable({
    data: usuarios,
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
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-1/2"
        />
        <div className="flex gap-4 items-end">
          <div className="flex items-center gap-2">
            <Switch checked={externo} onCheckedChange={setExterno} />
            <span>Usuario Externo</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={sinMigrar} onCheckedChange={setSinMigrar} />
            <span>Sin importar</span>
          </div>
          <Select value={tipoUsuario} onValueChange={setTipoUsuario}>
            <SelectTrigger>
              {tipoUsuario === "G"
                ? "Global"
                : tipoUsuario === "L"
                  ? "Local"
                  : "Tipo Usuario"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="G">Global</SelectItem>
              <SelectItem value="L">Local</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={estado} onValueChange={setEstado}>
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
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
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
  );
}
