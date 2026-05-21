"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { BadgeEstado } from "@/components/ui/badge-estado";
import { type ColumnDef } from "@tanstack/react-table";
import { apiAplicacionesDB, apiEliminarAplicacionDB, type AplicacionDB } from "@/services/api";
import { Pencil, Trash, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function AplicacionesTable() {
  const [rows, setRows] = useState<AplicacionDB[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [estado, setEstado] = useState("todos");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const router = useRouter();

  // debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  // load
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const res = await apiAplicacionesDB({
          filtro: debouncedSearch,
          estado: estado === "todos" ? "" : estado,
          page,
          pageSize,
        });
        setRows(res?.items ?? []);
        setTotal(Number(res?.total ?? 0));
      } catch (e: unknown) {
        if ((e as { name?: string })?.name !== "AbortError")
          console.error("Error cargando aplicaciones:", e);
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [debouncedSearch, estado, page, pageSize]);

  const handleEdit = (app: AplicacionDB) => {
    if (app?.id) router.push(`/dashboard/aplicaciones/editar/${app.id}`);
  };

  const handleDelete = async (app: AplicacionDB) => {
    if (!app?.id) return;
    if (!confirm(`¿Eliminar la aplicación "${app.nombre}"?`)) return;
    try {
      await apiEliminarAplicacionDB(app.id);
      setRows((prev) => prev.filter((r) => r.id !== app.id));
      toast.success("Aplicación eliminada");
    } catch {
      toast.error("Error al eliminar la aplicación");
    }
  };

  const columns: ColumnDef<AplicacionDB, unknown>[] = [
    { accessorKey: "nombre", header: "Aplicación" },
    {
      id: "descripcion",
      header: "Descripción",
      cell: ({ row }) => row.original?.descripcion ?? "-",
    },
    { accessorKey: "tecnologia", header: "Tecnología" },
    {
      id: "url",
      header: "URL",
      cell: ({ row }) => row.original?.url ?? "-",
    },
    {
      id: "estado",
      header: "Estado",
      cell: ({ row }) => <BadgeEstado estado={row.original?.estado ?? ""} />,
    },
    {
      id: "acciones",
      header: "Acciones",
      cell: ({ row }) => (
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleEdit(row.original)}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleDelete(row.original)}
          >
            <Trash className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  const estadoFilter = (
    <Select
      value={estado}
      onValueChange={(v) => {
        setEstado(v);
        setPage(1);
      }}
    >
      <SelectTrigger className="w-32">
        {estado === "A" ? "Activo" : estado === "I" ? "Inactivo" : "Estado"}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="A">Activo</SelectItem>
        <SelectItem value="I">Inactivo</SelectItem>
        <SelectItem value="todos">Todos</SelectItem>
      </SelectContent>
    </Select>
  );

  const headerActions = (
    <Button onClick={() => router.push("/dashboard/aplicaciones/crear")}>
      <Plus className="w-4 h-4 mr-1" /> Nueva Aplicación
    </Button>
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      loading={loading}
      total={total}
      page={page}
      pageSize={pageSize}
      onPageChange={setPage}
      onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
      searchValue={search}
      onSearchChange={(v) => { setSearch(v); setPage(1); }}
      searchPlaceholder="Búsqueda..."
      filters={estadoFilter}
      headerActions={headerActions}
      emptyTitle="Sin aplicaciones"
      emptyDescription="No se encontraron aplicaciones con los filtros actuales."
      pageSizeOptions={[10, 25, 50]}
    />
  );
}
