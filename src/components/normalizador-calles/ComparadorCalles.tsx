// components/normalizador-calles/ComparadorCalles.tsx
"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectItem, SelectContent } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { apiGetDepartamentos, apiGetLocalidades, apiGetCalles } from "@/services/api";
import { useReactTable, getCoreRowModel, flexRender } from "@tanstack/react-table";

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

interface CalleNueva {
  CalleNombre: string;
  CalleNombreLargo: string;
  CalleReferencia: string;
  CalleEstado: string;
}

export default function ComparadorCalles() {
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [selectedDepartamento, setSelectedDepartamento] = useState<number | null>(null);
  const [selectedLocalidad, setSelectedLocalidad] = useState<number | null>(null);
  const [callesNuevas, setCallesNuevas] = useState<CalleNueva[]>([]);

  // Tabla de calles nuevas
  const columnasCallesNuevas = [
    {
      accessorKey: "CalleNombre",
      header: "Nombre",
      cell: (info: any) => info.getValue(),
    },
    {
      accessorKey: "CalleNombreLargo",
      header: "Nombre Completo",
      cell: (info: any) => info.getValue(),
    },
    {
      accessorKey: "CalleReferencia",
      header: "Nombre Antiguo",
      cell: (info: any) => info.getValue(),
    },
  ];

  const tablaNuevas = useReactTable({
    data: callesNuevas,
    columns: columnasCallesNuevas,
    getCoreRowModel: getCoreRowModel(),
  });

  // Cargar departamentos
  useEffect(() => {
    apiGetDepartamentos()
      .then((res) => {
        const activos = res.sdtDepartamentos.filter((d: any) => d.DepartamentoEstado === "S");
        setDepartamentos(
          activos.map((d: any) => ({
            DepartamentoId: Number(d.DepartamentoId),
            DepartamentoNombre: d.DepartamentoNombre,
            DepartamentoEstado: d.DepartamentoEstado,
          }))
        );
      })
      .catch(() => toast.error("Error al cargar departamentos"));
  }, []);

  // Cargar localidades
  useEffect(() => {
    if (selectedDepartamento) {
      apiGetLocalidades({ DepartamentoId: selectedDepartamento.toString() })
        .then((res) => {
          const activos = res.sdtLocalidad.filter((l: any) => l.LocalidadEstado === "S");
          setLocalidades(
            activos.map((l: any) => ({
              LocalidadId: Number(l.LocalidadId),
              LocalidadNombre: l.LocalidadNombre,
              LocalidadEstado: l.LocalidadEstado,
            }))
          );
        })
        .catch(() => toast.error("Error al cargar localidades"));
    } else {
      setLocalidades([]);
    }
  }, [selectedDepartamento]);

  // Cargar calles nuevas
  useEffect(() => {
    if (selectedDepartamento) {
      const toastId = toast.loading("Cargando calles nuevas...");
      apiGetCalles({
        DepartamentoId: selectedDepartamento,
        LocalidadId: selectedLocalidad || 0,
      })
        .then((res) => {
          const filtradas = (res.sdtCalles || []).filter((c: any) => c.CalleEstado === "S");
          setCallesNuevas(filtradas);
          toast.success("Calles nuevas cargadas", { id: toastId });
        })
        .catch(() => toast.error("Error al cargar calles nuevas", { id: toastId }));
    }
  }, [selectedDepartamento, selectedLocalidad]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Normalizador de Calles</h2>

      <div className="flex gap-4">
        <Select value={selectedDepartamento?.toString() || ""} onValueChange={(v) => setSelectedDepartamento(Number(v))}>
          <SelectTrigger className="w-[250px]">
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

        <Select
          value={selectedLocalidad?.toString() || ""}
          onValueChange={(v) => setSelectedLocalidad(Number(v))}
          disabled={!selectedDepartamento}
        >
          <SelectTrigger className="w-[250px]">
            {localidades.find((l) => l.LocalidadId === selectedLocalidad)?.LocalidadNombre || "Localidad"}
          </SelectTrigger>
          <SelectContent>
            {localidades.map((l) => (
              <SelectItem key={l.LocalidadId} value={l.LocalidadId.toString()}>
                {l.LocalidadNombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {callesNuevas.length > 0 && (
        <div className="mt-4 border rounded-lg max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader>
              {tablaNuevas.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => (
                    <TableHead key={header.id}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {tablaNuevas.getRowModel().rows.map((row) => (
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
        </div>
      )}
    </div>
  );
}
