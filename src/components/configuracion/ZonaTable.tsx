"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, MapPin } from "lucide-react";
import { useReactTable, getCoreRowModel, flexRender } from "@tanstack/react-table";

interface Zona {
  id: string;
  tipoCapa: string;
  capa: string;
  zona: string;
  estado: string;
  geojson: any;
}

export default function ZonaTable({ data, onEdit, onDelete, onShowMap }: {
  data: Zona[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onShowMap: (geojson: any) => void;
}) {
  const columns = [
    { accessorKey: "tipoCapa", header: "Tipo Capa" },
    { accessorKey: "capa", header: "Capa" },
    { accessorKey: "zona", header: "Zona" },
    {
      accessorKey: "estado",
      header: "Estado",
      cell: ({ row }: { row: { original: Zona } }) => (
        <Badge
          className={
            row.original.estado === "A"
              ? "bg-green-100 text-green-800 border-green-300"
              : "bg-red-100 text-red-800 border-red-300"
          }
        >
          {row.original.estado === "A" ? "Activo" : "Pasivo"}
        </Badge>
      ),
    },
    {
      id: "mapa",
      header: "",
      cell: ({ row }: { row: { original: Zona } }) => (
        <Button variant="ghost" size="icon" onClick={() => onShowMap(row.original.geojson)}>
          <MapPin className="h-5 w-5 text-blue-600" />
        </Button>
      ),
    },
    {
      id: "acciones",
      header: "Acciones",
      cell: ({ row }: { row: { original: Zona } }) => (
        <div className="flex space-x-2">
          <button onClick={() => onEdit(row.original.id)} className="p-1 hover:bg-gray-100 rounded">
            <Edit className="h-4 w-4 text-blue-600 hover:text-blue-800" />
          </button>
          <button onClick={() => onDelete(row.original.id)} className="p-1 hover:bg-gray-100 rounded">
            <Trash2 className="h-4 w-4 text-red-600 hover:text-red-800" />
          </button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No hay zonas disponibles.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
