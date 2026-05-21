"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DataTable } from "@/components/ui/data-table";
import { BadgeEstado } from "@/components/ui/badge-estado";
import { type ColumnDef } from "@tanstack/react-table";
import {
  apiFuncionalidadesDB,
  apiEliminarFuncionalidadDB,
  type FuncionalidadDB,
} from "@/services/api";
import { Pencil, Plus, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function FuncionalidadesTable() {
  const [rows, setRows] = useState<FuncionalidadDB[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [estado, setEstado] = useState("todos");
  const [esPublico, setEsPublico] = useState(false);
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

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar esta funcionalidad?")) return;
    setLoading(true);
    try {
      await apiEliminarFuncionalidadDB(id);
      toast.success("Funcionalidad eliminada");
      setPage(1);
    } catch {
      toast.error("Error al eliminar la funcionalidad");
    } finally {
      setLoading(false);
    }
  };

  // load
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await apiFuncionalidadesDB({
          filtro: debouncedSearch,
          estado: estado === "todos" ? undefined : estado,
          esPublico: esPublico ? true : undefined,
          page,
          pageSize,
        });
        setRows(res?.items ?? []);
        setTotal(Number(res?.total ?? 0));
      } catch (e: unknown) {
        if ((e as { name?: string })?.name !== "AbortError")
          console.error("Error cargando funcionalidades:", e);
      }
    })();
    return () => ac.abort();
  }, [debouncedSearch, estado, esPublico, page, pageSize, loading]);

  const columns: ColumnDef<FuncionalidadDB, unknown>[] = [
    {
      id: "nombre",
      header: "Funcionalidad",
      cell: ({ row }) => row.original?.nombre ?? "",
    },
    {
      id: "estado",
      header: "Estado",
      cell: ({ row }) => <BadgeEstado estado={row.original?.estado ?? ""} />,
    },
    {
      id: "cantAcciones",
      header: "Cant. Acciones",
      cell: ({ row }) => {
        const c =
          (row.original as FuncionalidadDB & { _count?: { objetoAcciones?: number } })?._count?.objetoAcciones ??
          (row.original as FuncionalidadDB & { acciones?: unknown[] })?.acciones?.length ??
          0;
        return <span className="tabular-nums font-medium">{c}</span>;
      },
    },
    {
      id: "ops",
      header: "Acciones",
      cell: ({ row }) => (
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              router.push(`/dashboard/funcionalidades/editar/${row.original?.id}`)
            }
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={loading}
            onClick={() => handleDelete(row.original?.id)}
          >
            <Trash className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  const filters = (
    <>
      <div className="flex items-center gap-2">
        <Switch
          checked={esPublico}
          onCheckedChange={(v) => {
            setEsPublico(v);
            setPage(1);
          }}
        />
        <span className="text-sm">Es público</span>
      </div>
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
    </>
  );

  const headerActions = (
    <Button onClick={() => router.push("/dashboard/funcionalidades/crear")}>
      <Plus className="w-4 h-4 mr-1" />
      Nueva Funcionalidad
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
      searchPlaceholder="Buscar funcionalidad..."
      filters={filters}
      headerActions={headerActions}
      emptyTitle="Sin funcionalidades"
      emptyDescription="No se encontraron funcionalidades con los filtros actuales."
      pageSizeOptions={[10, 25, 50]}
    />
  );
}
