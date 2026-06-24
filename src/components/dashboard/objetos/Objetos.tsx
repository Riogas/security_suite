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
import { Badge } from "@/components/ui/badge";
import { type ColumnDef } from "@tanstack/react-table";
import {
  apiObjetosDB,
  apiEliminarObjetoDB,
  apiAplicacionesDB,
  type AplicacionDB,
} from "@/services/api";
import { Pencil, Trash } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const TIPO_CHIP: Record<string, string> = {
  MENU: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
  SUBMENU: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  PAGE: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  FEATURE: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
};

type ObjetoRow = {
  id: number;
  key?: string;
  label?: string;
  path?: string;
  tipo?: string;
  estado: string;
  aplicacionId?: number;
  aplicacion?: { id: number; nombre: string };
};

export default function ObjetosTable() {
  const [rows, setRows] = useState<ObjetoRow[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [estado, setEstado] = useState("todos");
  const [esPublico, setEsPublico] = useState(false);
  const [tipo, setTipo] = useState("todos");
  const [aplicacionId, setAplicacionId] = useState("todos");
  const [aplicaciones, setAplicaciones] = useState<AplicacionDB[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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

  // load
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await apiObjetosDB({
          filtro: debouncedSearch,
          estado: estado === "todos" ? undefined : estado,
          esPublico: esPublico ? "S" : undefined,
          tipo: tipo === "todos" ? undefined : tipo,
          aplicacionId: aplicacionId === "todos" ? undefined : Number(aplicacionId),
          page,
          pageSize,
        });
        setRows(res?.items ?? []);
        setTotal(Number(res?.total ?? 0));
      } catch (e: unknown) {
        if ((e as { name?: string })?.name !== "AbortError")
          console.error("Error cargando objetos:", e);
      }
    })();
    return () => ac.abort();
  }, [debouncedSearch, estado, esPublico, tipo, aplicacionId, page, pageSize]);

  const columns: ColumnDef<ObjetoRow, unknown>[] = [
    {
      id: "aplicacion",
      header: "Aplicación",
      cell: ({ row }) =>
        row.original?.aplicacion?.nombre ??
        (row.original?.aplicacionId ? `#${row.original.aplicacionId}` : "—"),
    },
    {
      id: "key",
      header: "Clave",
      cell: ({ row }) => row.original?.key ?? "",
    },
    {
      id: "label",
      header: "Etiqueta",
      cell: ({ row }) => row.original?.label ?? "",
    },
    {
      id: "path",
      header: "Path",
      cell: ({ row }) => row.original?.path ?? "",
    },
    {
      id: "tipo",
      header: "Tipo",
      cell: ({ row }) => {
        const t = row.original?.tipo ?? "";
        return t ? (
          <Badge variant="secondary" className={`text-[10px] ${TIPO_CHIP[t] ?? ""}`}>
            {t}
          </Badge>
        ) : (
          ""
        );
      },
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
            aria-label={`Editar objeto ${row.original?.key ?? row.original?.id ?? ""}`}
            onClick={() =>
              router.push(`/dashboard/objetos/editar/${row.original?.id ?? ""}`)
            }
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              const obj = row.original;
              if (!obj?.id) return;
              if (!confirm(`¿Eliminar el objeto "${obj.key}"?`)) return;
              try {
                await apiEliminarObjetoDB(obj.id);
                setRows((prev) => prev.filter((r) => r.id !== obj.id));
                toast.success("Objeto eliminado");
              } catch {
                toast.error("Error al eliminar el objeto");
              }
            }}
          >
            <Trash className="w-4 h-4" aria-hidden="true" />
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
      <Select
        value={tipo}
        onValueChange={(v) => {
          setTipo(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-32">{tipo === "todos" ? "Tipo" : tipo}</SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos</SelectItem>
          {["MENU", "SUBMENU", "PAGE", "FEATURE"].map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
    </>
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
      filters={filters}
      emptyTitle="Sin objetos"
      emptyDescription="No se encontraron objetos con los filtros actuales."
      pageSizeOptions={[10, 25, 50]}
    />
  );
}
