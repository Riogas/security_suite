"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { BadgeEstado } from "@/components/ui/badge-estado";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { type ColumnDef } from "@tanstack/react-table";
import {
  apiAccesosDB,
  apiEliminarAccesoDB,
  apiAplicacionesDB,
  type AccesoDB,
  type AplicacionDB,
} from "@/services/api";
import { Trash } from "lucide-react";
import { toast } from "sonner";

export default function PermisosTable() {
  const [allRows, setAllRows] = useState<AccesoDB[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [aplicacionId, setAplicacionId] = useState("todos");
  const [aplicaciones, setAplicaciones] = useState<AplicacionDB[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  // cargar aplicaciones para el filtro
  useEffect(() => {
    (async () => {
      try {
        const res = await apiAplicacionesDB({ estado: "A", pageSize: 1000 });
        setAplicaciones(res?.items ?? []);
      } catch (e) {
        console.error("Error cargando aplicaciones:", e);
      }
    })();
  }, []);

  // load all accesos (client-side pagination)
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const data = await apiAccesosDB({});
        setAllRows(data);
      } catch (e: unknown) {
        if ((e as { name?: string })?.name !== "AbortError")
          console.error("Error cargando accesos:", e);
      }
    })();
    return () => ac.abort();
  }, [loading]);

  // client-side filter + paginate
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const appId = aplicacionId === "todos" ? null : Number(aplicacionId);
    return allRows.filter((a) => {
      if (appId !== null && a.funcionalidad?.aplicacion?.id !== appId) return false;
      if (!q) return true;
      return (
        a.funcionalidad?.nombre?.toLowerCase().includes(q) ||
        a.usuario?.username?.toLowerCase().includes(q) ||
        a.usuario?.nombre?.toLowerCase().includes(q) ||
        a.funcionalidad?.aplicacion?.nombre?.toLowerCase().includes(q)
      );
    });
  }, [allRows, debouncedSearch, aplicacionId]);

  const pageSlice = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  const handleDelete = async (item: AccesoDB) => {
    if (
      !confirm(
        `¿Eliminar acceso de "${item.usuario?.username}" a "${item.funcionalidad?.nombre}"?`,
      )
    )
      return;
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

  const columns: ColumnDef<AccesoDB, unknown>[] = [
    {
      id: "funcionalidad",
      header: "Funcionalidad",
      cell: ({ row }) => row.original?.funcionalidad?.nombre ?? "-",
    },
    {
      id: "aplicacion",
      header: "Aplicación",
      cell: ({ row }) => row.original?.funcionalidad?.aplicacion?.nombre ?? "-",
    },
    {
      id: "usuario",
      header: "Usuario",
      cell: ({ row }) => {
        const u = row.original?.usuario;
        return u ? `${u.username}${u.nombre ? ` — ${u.nombre}` : ""}` : "-";
      },
    },
    {
      id: "efecto",
      header: "Efecto",
      cell: ({ row }) => (
        <BadgeEstado estado={row.original?.efecto ?? ""} />
      ),
    },
    {
      id: "ops",
      header: "Acciones",
      cell: ({ row }) => (
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

  return (
    <DataTable
      columns={columns}
      data={pageSlice}
      loading={false}
      total={filtered.length}
      page={page}
      pageSize={pageSize}
      onPageChange={setPage}
      onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
      searchValue={search}
      onSearchChange={(v) => { setSearch(v); setPage(1); }}
      searchPlaceholder="Buscar acceso..."
      filters={
        <Select
          value={aplicacionId}
          onValueChange={(v) => {
            setAplicacionId(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            {aplicacionId === "todos"
              ? "Aplicación"
              : aplicaciones.find((a) => String(a.id) === aplicacionId)?.nombre ?? "Aplicación"}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            {aplicaciones.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      emptyTitle="Sin permisos"
      emptyDescription="No se encontraron accesos con los filtros actuales."
      pageSizeOptions={[10, 25, 50]}
    />
  );
}
