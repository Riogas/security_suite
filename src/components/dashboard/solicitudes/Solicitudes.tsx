"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import {
  apiListarSolicitudes,
  type SolicitudPermisoItem,
  type SolicitudEstado,
} from "@/services/api";
import RevisarSolicitudModal from "./RevisarSolicitudModal";

const ESTADO_VARIANT: Record<SolicitudEstado, "warning" | "success" | "destructive" | "secondary"> = {
  PENDIENTE: "warning",
  APROBADA: "success",
  RECHAZADA: "destructive",
  CANCELADA: "secondary",
};
const ESTADO_LABEL: Record<SolicitudEstado, string> = {
  PENDIENTE: "Pendiente",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  CANCELADA: "Cancelada",
};

function nombreUsuario(s: SolicitudPermisoItem): string {
  const u = s.usuario;
  if (!u) return `#${s.usuarioId}`;
  const full = [u.nombre, u.apellido].filter(Boolean).join(" ").trim();
  return full || u.username || `#${s.usuarioId}`;
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-UY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function Solicitudes() {
  const [rows, setRows] = useState<SolicitudPermisoItem[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [estado, setEstado] = useState("PENDIENTE");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [seleccionada, setSeleccionada] = useState<SolicitudPermisoItem | null>(null);
  const [reload, setReload] = useState(0);

  // debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await apiListarSolicitudes({
          estado: estado === "todos" ? undefined : estado,
          search: debouncedSearch || undefined,
          page,
          pageSize,
        });
        if (!mounted) return;
        setRows(res?.items ?? []);
        setTotal(Number(res?.total ?? 0));
      } catch (e: unknown) {
        if (mounted) toast.error(e instanceof Error ? e.message : "Error al cargar solicitudes");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [debouncedSearch, estado, page, pageSize, reload]);

  const columns: ColumnDef<SolicitudPermisoItem, unknown>[] = [
    {
      id: "usuario",
      header: "Usuario",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{nombreUsuario(row.original)}</span>
          {row.original.usuario?.username && (
            <span className="text-xs text-muted-foreground">{row.original.usuario.username}</span>
          )}
        </div>
      ),
    },
    {
      id: "recurso",
      header: "Recurso solicitado",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{row.original.objeto?.label || row.original.objeto?.key}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.objeto?.tipo} · {row.original.accionKey}
          </span>
        </div>
      ),
    },
    {
      id: "aplicacion",
      header: "Aplicación",
      cell: ({ row }) => row.original.aplicacion?.nombre ?? row.original.aplicacionId,
    },
    {
      id: "fecha",
      header: "Solicitada",
      cell: ({ row }) => fmtFecha(row.original.fechaCreacion),
    },
    {
      id: "estado",
      header: "Estado",
      cell: ({ row }) => {
        const e = row.original.estado;
        return (
          <div className="flex items-center gap-2">
            <Badge variant={ESTADO_VARIANT[e]}>{ESTADO_LABEL[e]}</Badge>
            {e === "PENDIENTE" && row.original.requiereVinculo && (
              <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                requiere vínculo
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: "acciones",
      header: "Acciones",
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSeleccionada(row.original)}
          aria-label="Revisar solicitud"
        >
          <Eye className="w-4 h-4 mr-1" aria-hidden="true" />
          Revisar
        </Button>
      ),
    },
  ];

  const filters = (
    <Select
      value={estado}
      onValueChange={(v) => {
        setEstado(v);
        setPage(1);
      }}
    >
      <SelectTrigger className="w-40">
        {estado === "todos" ? "Todos" : ESTADO_LABEL[estado as SolicitudEstado] ?? "Estado"}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="PENDIENTE">Pendientes</SelectItem>
        <SelectItem value="APROBADA">Aprobadas</SelectItem>
        <SelectItem value="RECHAZADA">Rechazadas</SelectItem>
        <SelectItem value="todos">Todas</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Buscar por usuario u objeto…"
        filters={filters}
        emptyTitle="Sin solicitudes"
        emptyDescription="No hay solicitudes con los filtros actuales."
        pageSizeOptions={[10, 20, 50]}
      />

      <RevisarSolicitudModal
        isOpen={seleccionada !== null}
        onClose={() => setSeleccionada(null)}
        solicitud={seleccionada}
        onResuelta={() => setReload((r) => r + 1)}
      />
    </>
  );
}
