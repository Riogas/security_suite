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
import { apiRolesDB, apiEliminarRolDB, apiClonarRolDB, type RolDB } from "@/services/api";
import { Pencil, Trash, Plus, Settings, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import AtributosRolModal from "@/components/dashboard/roles/AtributosRolModal";
import ClonarRolModal from "@/components/dashboard/roles/ClonarRolModal";

export default function RolesTable() {
  const [rows, setRows] = useState<RolDB[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [estado, setEstado] = useState("todos");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [atributosModal, setAtributosModal] = useState<{ rolId: number; rolNombre: string } | null>(null);
  const [clonarModal, setClonarModal] = useState<{ rolId: number; rolNombre: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
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
        const res = await apiRolesDB({
          filtro: debouncedSearch,
          estado: estado === "todos" ? undefined : estado,
          page,
          pageSize,
        });
        setRows(res?.items ?? []);
        setTotal(Number(res?.total ?? 0));
      } catch (e: unknown) {
        if ((e as { name?: string })?.name !== "AbortError")
          console.error("Error cargando roles:", e);
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [debouncedSearch, estado, page, pageSize, refreshKey]);

  const handleClonar = async (nombre: string) => {
    if (!clonarModal) return;
    const res = await apiClonarRolDB(clonarModal.rolId, nombre);
    if (res?.success) {
      toast.success("Rol clonado exitosamente");
      setClonarModal(null);
      setRefreshKey((k) => k + 1);
    } else {
      throw new Error(res?.error || "Error al clonar el rol");
    }
  };

  const columns: ColumnDef<RolDB, unknown>[] = [
    { accessorKey: "nombre", header: "Rol" },
    {
      id: "descripcion",
      header: "Descripción",
      cell: ({ row }) => row.original?.descripcion ?? "-",
    },
    {
      id: "aplicacion",
      header: "Aplicación",
      cell: ({ row }) => (row.original as RolDB & { aplicacion?: { nombre: string } })?.aplicacion?.nombre ?? "-",
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
            onClick={() => router.push(`/dashboard/roles/editar/${row.original?.id ?? ""}`)}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            title="Gestionar atributos del rol"
            onClick={() =>
              setAtributosModal({ rolId: row.original.id, rolNombre: row.original.nombre })
            }
          >
            <Settings className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            title="Clonar rol"
            onClick={() =>
              setClonarModal({ rolId: row.original.id, rolNombre: row.original.nombre })
            }
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              if (!confirm(`¿Eliminar el rol "${row.original?.nombre}"?`)) return;
              try {
                await apiEliminarRolDB(row.original.id);
                setRows((prev) => prev.filter((r) => r.id !== row.original.id));
                toast.success("Rol eliminado");
              } catch {
                toast.error("Error al eliminar el rol");
              }
            }}
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
      <SelectTrigger className="w-36">
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
    <Button onClick={() => router.push("/dashboard/roles/crear")}>
      <Plus className="w-4 h-4 mr-1" /> Nuevo Rol
    </Button>
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
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Buscar rol..."
        filters={estadoFilter}
        headerActions={headerActions}
        emptyTitle="Sin roles"
        emptyDescription="No se encontraron roles con los filtros actuales."
        pageSizeOptions={[10, 25, 50]}
      />

      {atributosModal && (
        <AtributosRolModal
          isOpen={true}
          onClose={() => setAtributosModal(null)}
          rolId={atributosModal.rolId}
          rolNombre={atributosModal.rolNombre}
        />
      )}

      {clonarModal && (
        <ClonarRolModal
          isOpen={true}
          rolNombre={clonarModal.rolNombre}
          onClose={() => setClonarModal(null)}
          onClonar={handleClonar}
        />
      )}
    </>
  );
}
