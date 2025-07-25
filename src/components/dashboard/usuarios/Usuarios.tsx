
"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash } from "lucide-react";
import { debounce } from "lodash";
import { useReactTable, getCoreRowModel, getPaginationRowModel, flexRender } from "@tanstack/react-table";
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

// Mock de usuarios
const mockUsuarios = [
  {
    usuario: "jgomez",
    nombre: "Julio Gómez",
    mail: "julio.gomez@ejemplo.com",
    estado: "A",
    fchUltLogin: "2025-07-20 10:23",
    tipoUsuario: "G",
    externo: false,
  },
  {
    usuario: "lperez",
    nombre: "Laura Pérez",
    mail: "laura.perez@ejemplo.com",
    estado: "I",
    fchUltLogin: "2025-07-18 09:10",
    tipoUsuario: "L",
    externo: true,
  },
];

export default function UsuariosTable() {
  const router = useRouter();
  const [usuarios] = useState(mockUsuarios);
  const [searchTerm, setSearchTerm] = useState("");
  const [estado, setEstado] = useState("todos");
  const [externo, setExterno] = useState(false);
  const [tipoUsuario, setTipoUsuario] = useState("todos");

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
      const matchesTipo = tipoUsuario === "todos" || u.tipoUsuario === tipoUsuario;
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
      cell: ({ row }: { row: { original: typeof mockUsuarios[number] } }) => (
        <Badge className={row.original.estado === "A" ? "bg-green-900 text-green-200" : "bg-red-900 text-red-200"}>
          {row.original.estado === "A" ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    { accessorKey: "fchUltLogin", header: "Fch Ult Login" },
    {
      accessorKey: "tipoUsuario",
      header: "Tipo Usuario",
      cell: ({ row }: { row: { original: typeof mockUsuarios[number] } }) => (row.original.tipoUsuario === "G" ? "Global" : "Local"),
    },
    {
      accessorKey: "acciones",
      header: "Acciones",
      cell: ({ row }: { row: { original: typeof mockUsuarios[number] } }) => (
        <div className="space-x-2">
          <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/usuarios/editar/${row.original.usuario}`)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant="destructive" size="sm"><Trash className="w-4 h-4" /></Button>
        </div>
      ),
    },
  ];

  // react-table
  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div>
      <div className="flex justify-between items-end mb-4">
        <Input
          placeholder="Búsqueda..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-1/2"
        />
        <div className="flex gap-4 items-end">
          <div className="flex items-center gap-2">
            <Switch checked={externo} onCheckedChange={setExterno} />
            <span>Usuario Externo</span>
          </div>
          <Select value={tipoUsuario} onValueChange={setTipoUsuario}>
            <SelectTrigger>
              {tipoUsuario === "G" ? "Global" : tipoUsuario === "L" ? "Local" : "Tipo Usuario"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="G">Global</SelectItem>
              <SelectItem value="L">Local</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={estado} onValueChange={setEstado}>
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
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
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
            <Select value={String(table.getState().pagination.pageSize)} onValueChange={v => table.setPageSize(Number(v))}>
              <SelectTrigger>{table.getState().pagination.pageSize}</SelectTrigger>
              <SelectContent>
                {[10, 25, 50].map((size) => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span>
            Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
          </span>
          <div className="flex items-center gap-2">
            <Button onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
              «
            </Button>
            <Button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              ‹
            </Button>
            <Button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              ›
            </Button>
            <Button onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
              »
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
