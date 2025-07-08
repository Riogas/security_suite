// components/normalizador-calles/ComparadorCalles.tsx
"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectItem,
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
import { toast } from "sonner";
import {
  apiGetDepartamentos,
  apiGetLocalidades,
  apiGetCalles,
  apiGetCallesICA,
} from "@/services/api";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import { compararCalles, ComparacionCalle } from "@/lib/comparadorCalles";

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

interface CalleVieja {
  CalCantCli: number;
  CalEstado: string;
  CalNom: string;
  CalNombreBusqueda: string;
  CalObs: string;
}

export default function ComparadorCalles() {
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [selectedDepartamento, setSelectedDepartamento] = useState<
    number | null
  >(null);
  const [selectedLocalidad, setSelectedLocalidad] = useState<number | null>(
    null,
  );
  const [callesNuevas, setCallesNuevas] = useState<CalleNueva[]>([]);
  const [callesViejas, setCallesViejas] = useState<CalleVieja[]>([]);
  const [loadingComparar, setLoadingComparar] = useState(false);
  const [resultadosComparacion, setResultadosComparacion] = useState<
    ComparacionCalle[]
  >([]);

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

  const columnasCallesViejas = [
    {
      accessorKey: "CalNom",
      header: "Nombre",
      cell: (info: any) => info.getValue(),
    },
    {
      accessorKey: "CalNombreBusqueda",
      header: "Nombre Completo",
      cell: (info: any) => info.getValue(),
    },
    {
      accessorKey: "CalObs",
      header: "Observaciones",
      cell: (info: any) => info.getValue(),
    },
    {
      accessorKey: "CalCantCli",
      header: "Cantidad Clientes",
      cell: (info: any) => info.getValue(),
    },
    {
      accessorKey: "CalEstado",
      header: "Estado",
      cell: (info: any) => info.getValue(),
    },
  ];

  const tablaViejas = useReactTable({
    data: callesViejas,
    columns: columnasCallesViejas,
    getCoreRowModel: getCoreRowModel(),
  });

  useEffect(() => {
    apiGetDepartamentos()
      .then((res) => {
        const activos = res.sdtDepartamentos.filter(
          (d: any) => d.DepartamentoEstado === "S",
        );
        setDepartamentos(
          activos.map((d: any) => ({
            DepartamentoId: Number(d.DepartamentoId),
            DepartamentoNombre: d.DepartamentoNombre,
            DepartamentoEstado: d.DepartamentoEstado,
          })),
        );
      })
      .catch(() => toast.error("Error al cargar departamentos"));
  }, []);

  useEffect(() => {
    if (selectedDepartamento) {
      apiGetLocalidades({ DepartamentoId: selectedDepartamento.toString() })
        .then((res) => {
          const activos = res.sdtLocalidad.filter(
            (l: any) => l.LocalidadEstado === "S",
          );
          setLocalidades(
            activos.map((l: any) => ({
              LocalidadId: Number(l.LocalidadId),
              LocalidadNombre: l.LocalidadNombre,
              LocalidadEstado: l.LocalidadEstado,
            })),
          );
        })
        .catch(() => toast.error("Error al cargar localidades"));
    } else {
      setLocalidades([]);
    }
  }, [selectedDepartamento]);

  useEffect(() => {
    if (selectedDepartamento) {
      const toastId = toast.loading("Cargando...");
      apiGetCalles({
        DepartamentoId: selectedDepartamento,
        LocalidadId: selectedLocalidad || 0,
      })
        .then((res) => {
          const filtradas = (res.sdtCalles || []).filter(
            (c: any) => c.CalleEstado === "S",
          );
          setCallesNuevas(filtradas);
          toast.success("Calles cargadas", { id: toastId });
        })
        .catch(() =>
          toast.error("Error al cargar calles nuevas", { id: toastId }),
        );
    }
  }, [selectedDepartamento, selectedLocalidad]);

  useEffect(() => {
    if (selectedDepartamento) {
      apiGetCallesICA({
        DepartamentoId: selectedDepartamento,
        LocalidadId: selectedLocalidad || 0,
      })
        .then((res) => setCallesViejas(res.sdtCallesICA || []))
        .catch(() => toast.error("Error al cargar calles viejas"));
    } else {
      setCallesViejas([]);
    }
  }, [selectedDepartamento, selectedLocalidad]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Normalizador de Calles</h2>
      <div className="flex gap-4">
        <Select
          value={selectedDepartamento?.toString() || ""}
          onValueChange={(v) => setSelectedDepartamento(Number(v))}
        >
          <SelectTrigger className="w-[250px]">
            {departamentos.find(
              (d) => d.DepartamentoId === selectedDepartamento,
            )?.DepartamentoNombre || "Departamento"}
          </SelectTrigger>
          <SelectContent>
            {departamentos.map((d) => (
              <SelectItem
                key={d.DepartamentoId}
                value={d.DepartamentoId.toString()}
              >
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
            {localidades.find((l) => l.LocalidadId === selectedLocalidad)
              ?.LocalidadNombre || "Localidad"}
          </SelectTrigger>
          <SelectContent>
            {localidades.map((l) => (
              <SelectItem key={l.LocalidadId} value={l.LocalidadId.toString()}>
                {l.LocalidadNombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          className="flex items-center gap-2"
          onClick={async () => {
            setLoadingComparar(true);
            try {
              const resultados = compararCalles(callesNuevas, callesViejas);
              setResultadosComparacion(resultados);
              toast.success("Comparación realizada");
            } catch (e) {
              toast.error("Error al comparar calles");
              console.log(e);
            } finally {
              setLoadingComparar(false);
            }
          }}
        >
          <span>Comparar Calles</span>
          {loadingComparar && (
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-blue-500"></div>
          )}
        </Button>
      </div>

      <div className="w-full overflow-x-auto">
        <div className="flex gap-4 w-[max-content]">
          {/* Tabla de Calles Nuevas */}
          <div className="w-[600px]">
            {callesNuevas.length > 0 && (
              <div className="mt-4 border rounded-lg max-h-[600px] overflow-y-auto">
                <Table className="w-full">
                  <TableHeader>
                    {tablaNuevas.getHeaderGroups().map((group) => (
                      <TableRow key={group.id}>
                        {group.headers.map((header) => (
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
                    {tablaNuevas.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Tabla de Calles Viejas */}
          <div className="w-[600px]">
            {callesViejas.length > 0 && (
              <div className="mt-4 border rounded-lg max-h-[600px] overflow-y-auto">
                <Table className="w-full">
                  <TableHeader>
                    {tablaViejas.getHeaderGroups().map((group) => (
                      <TableRow key={group.id}>
                        {group.headers.map((header) => (
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
                    {tablaViejas.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabla de resultados de comparación */}
      {resultadosComparacion.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-2">
            Resultados de la Comparación
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full border rounded-lg text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 border">Calle Base</th>
                  <th className="px-3 py-2 border">Calle Comparada</th>
                  <th className="px-3 py-2 border">Similitud (%)</th>
                  <th className="px-3 py-2 border">Estado</th>
                  <th className="px-3 py-2 border">Acción Manual</th>
                </tr>
              </thead>
              <tbody>
                {resultadosComparacion.map((r, idx) => {
                  const sim = Math.round(r.score * 100);
                  let estado = "";
                  let icon = "";
                  let estadoTexto = "";
                  if (sim >= 90) {
                    icon = "✅";
                    estado = "Confirmado";
                    estadoTexto = "bg-green-100 text-green-800";
                  } else if (sim >= 85) {
                    icon = "⚠️";
                    estado = "Automático";
                    estadoTexto = "bg-yellow-100 text-yellow-800";
                  } else if (r.candidato) {
                    icon = "⚠️";
                    estado = "Automático";
                    estadoTexto = "bg-orange-100 text-orange-800";
                  } else {
                    icon = "❌";
                    estado = "Sin coincidencia";
                    estadoTexto = "bg-red-100 text-red-800";
                  }
                  return (
                    <tr key={idx} className="border-b">
                      <td className="px-3 py-2 border font-medium">
                        {r.base.CalleNombre}
                      </td>
                      <td className="px-3 py-2 border">
                        {r.candidato ? (
                          r.candidato.CalNom
                        ) : (
                          <span className="italic text-gray-400">no match</span>
                        )}
                      </td>
                      <td
                        className="px-3 py-2 border text-center"
                        style={{ color: r.color }}
                      >
                        {sim}% {icon}
                      </td>
                      <td
                        className={`px-3 py-2 border text-center ${estadoTexto}`}
                      >
                        {estado}
                      </td>
                      <td className="px-3 py-2 border text-center">
                        {sim < 85 ? (
                          <button className="px-2 py-1 rounded bg-blue-100 text-blue-800 hover:bg-blue-200 transition">
                            Marcar
                          </button>
                        ) : (
                          <button
                            className="px-2 py-1 rounded bg-gray-100 text-gray-500 cursor-not-allowed"
                            disabled
                          >
                            Cambiar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
