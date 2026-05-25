"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { apiUsuarios, apiImportarUsuario, apiUsuariosDB, apiEliminarUsuarioDB } from "@/services/api";
import VerPermisosModal from "@/components/dashboard/usuarios/VerPermisosModal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Pencil,
  Trash,
  Download,
  Mail,
  Phone,
  Plus,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Unified row type: DB users come with _source="db", GeneXus users with _source="genexus"
// Using index signature to allow GeneXus dynamic keys
type UsuarioRow = {
  _source: "db" | "genexus";
  [key: string]: unknown;
};

export default function UsuariosTable() {
  const [rows, setRows] = useState<UsuarioRow[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [estado, setEstado] = useState("todos");
  const [tipoUsuario, setTipoUsuario] = useState("locales");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [importingUsers, setImportingUsers] = useState<Set<number>>(new Set());
  const [importedUsers, setImportedUsers] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [permisosModal, setPermisosModal] = useState<{ userId: number; userName: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<UsuarioRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  // debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  // =============================================
  // Fetchers
  // =============================================
  const fetcherGeneXus = async (opts: {
    FiltroTexto: string;
    Estado: string;
    Pagesize: number;
    CurrentPage: number;
    signal?: AbortSignal;
  }) => {
    const res = await apiUsuarios(
      {
        FiltroTexto: opts.FiltroTexto,
        Estado: opts.Estado,
        sinMigrar: true,
        Pagesize: String(opts.Pagesize),
        CurrentPage: String(opts.CurrentPage),
      },
      { signal: opts.signal },
    );
    const items = res?.SdtUsuarios || res?.sdtUsuarios || res?.items || [];
    const totalCount = Number(
      res?.MaxRegistros ?? res?.maxRegistros ?? res?.total ?? (items?.length || 0),
    );
    return { items: items as Record<string, unknown>[], total: totalCount };
  };

  const fetcherDB = async (opts: {
    filtro: string;
    estado: string;
    page: number;
    pageSize: number;
    signal?: AbortSignal;
  }) => {
    const res = await apiUsuariosDB({
      filtro: opts.filtro,
      estado: opts.estado,
      page: opts.page,
      pageSize: opts.pageSize,
      signal: opts.signal,
    });
    return { items: res.items as unknown as Record<string, unknown>[], total: res.total };
  };

  // load
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);

        if (tipoUsuario === "sinImportar") {
          const estadoGx = estado === "S" ? "S" : estado === "N" ? "N" : "";
          const { items, total: fetchedTotal } = await fetcherGeneXus({
            FiltroTexto: debouncedSearch,
            Estado: estadoGx,
            Pagesize: pageSize,
            CurrentPage: page,
            signal: ac.signal,
          });
          setRows(items.map((u) => ({ ...u, _source: "genexus" as const })));
          setTotal(fetchedTotal);
        } else {
          const estadoDB = estado === "S" ? "A" : estado === "N" ? "I" : "";
          const { items, total: fetchedTotal } = await fetcherDB({
            filtro: debouncedSearch,
            estado: estadoDB,
            page,
            pageSize,
            signal: ac.signal,
          });
          setRows(items.map((u) => ({ ...u, _source: "db" as const })));
          setTotal(Number(fetchedTotal));
        }
      } catch (e: unknown) {
        if ((e as { name?: string })?.name !== "AbortError")
          console.error("Error cargando usuarios:", e);
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [debouncedSearch, estado, tipoUsuario, page, pageSize]);

  // =============================================
  // Helpers
  // =============================================
  const getInitials = (nombre: string) => {
    if (!nombre || nombre.trim() === "" || nombre === "undefined") return "U";
    const words = nombre.trim().split(" ").filter((word) => word.length > 0);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return nombre.substring(0, 1).toUpperCase() || "U";
  };

  const getUserName = (row: UsuarioRow): string =>
    row._source === "db"
      ? `${row.nombre || ""} ${row.apellido || ""}`.trim() || String(row.username ?? "")
      : String(row.UserExtendedNombre ?? "Sin nombre");

  const getUserUsername = (row: UsuarioRow): string =>
    row._source === "db"
      ? String(row.username ?? "sin-usuario")
      : String(row.UserExtendedUserName ?? "sin-usuario");

  const getUserEmail = (row: UsuarioRow): string | undefined =>
    row._source === "db"
      ? (row.email as string | null | undefined) ?? undefined
      : (row.UserExtendedEmail as string | null | undefined) ?? undefined;

  const getUserId = (row: UsuarioRow): number =>
    row._source === "db"
      ? (row.id as number)
      : (row.UserExtendedId as number);

  const getUserTelefono = (row: UsuarioRow): string | undefined =>
    row._source === "db"
      ? (row.telefono as string | null | undefined) ?? undefined
      : (row.UserExtendedTelefono as string | null | undefined) ?? undefined;

  const getUserEstado = (row: UsuarioRow): boolean => {
    if (row._source === "db") return row.estado === "A";
    const est = row.UserExtendedEstado as string | undefined;
    return est === "S" || est === "A";
  };

  const isFromDB = (row: UsuarioRow): boolean => row._source === "db";

  const shouldShowImportButton = (user: UsuarioRow): boolean => {
    const userId = user.UserExtendedId as number | undefined;
    return (
      tipoUsuario === "sinImportar" &&
      userId != null &&
      !importedUsers.has(userId) &&
      Boolean(user.UserExtendedNombre)
    );
  };

  const handleImportUser = async (user: UsuarioRow) => {
    const userId = user.UserExtendedId as number | undefined;
    if (!userId) { console.error("ID de usuario no válido"); return; }
    try {
      setImportingUsers((prev) => new Set(prev).add(userId));
      const response = await apiImportarUsuario({ UserExtendedId: userId, AplicacionId: 2 });
      if (response.success) {
        toast.success(`Usuario ${String(user.UserExtendedNombre)} importado exitosamente`);
        setImportedUsers((prev) => new Set(prev).add(userId));
      } else {
        toast.error("Error al importar usuario: " + (response.message || ""));
      }
    } catch (error) {
      console.error("Error en la importación:", error);
      toast.error("Error al importar usuario");
    } finally {
      setImportingUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    const id = getUserId(deleteConfirm);
    if (!id) return;
    setDeleting(true);
    try {
      await apiEliminarUsuarioDB(id);
      toast.success("Usuario desactivado correctamente");
      setRows((prev) => prev.filter((r) => getUserId(r) !== id));
      setDeleteConfirm(null);
    } catch (error: unknown) {
      toast.error("Error al desactivar: " + (error as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  // =============================================
  // Columns
  // =============================================
  const columns: ColumnDef<UsuarioRow, unknown>[] = [
    {
      id: "usuario",
      header: "Usuario",
      cell: ({ row }) => (
        <div className="flex items-center space-x-3">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="text-xs">
              {getInitials(getUserName(row.original))}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{getUserName(row.original)}</div>
            <div className="text-sm text-muted-foreground">@{getUserUsername(row.original)}</div>
            {getUserEmail(row.original) && (
              <div className="text-sm text-muted-foreground flex items-center">
                <Mail className="w-3 h-3 mr-1" />
                {getUserEmail(row.original)}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "username",
      header: "Nombre de Usuario",
      cell: ({ row }) => (
        <div className="font-mono text-sm">{getUserUsername(row.original)}</div>
      ),
    },
    {
      id: "id",
      header: "ID",
      cell: ({ row }) => {
        if (isFromDB(row.original)) {
          return <Badge variant="secondary">ID: {getUserId(row.original)}</Badge>;
        }
        if (row.original.sinMigrar) {
          return <Badge variant="outline" className="text-muted-foreground">Sin asignar</Badge>;
        }
        return <Badge variant="secondary">ID: {getUserId(row.original) || "-"}</Badge>;
      },
    },
    {
      id: "telefono",
      header: "Teléfono",
      cell: ({ row }) => {
        const tel = getUserTelefono(row.original);
        return tel ? (
          <div className="flex items-center text-sm">
            <Phone className="w-3 h-3 mr-1" />
            {tel}
          </div>
        ) : "-";
      },
    },
    {
      id: "estado",
      header: "Estado",
      cell: ({ row }) => {
        const activo = getUserEstado(row.original);
        return (
          <Badge variant={activo ? "success" : "secondary"}>
            {activo ? "Activo" : "Inactivo"}
          </Badge>
        );
      },
    },
    {
      id: "origen",
      header: "Origen",
      cell: ({ row }) =>
        isFromDB(row.original) ? (
          <Badge variant="outline" className="border-blue-500 text-blue-400">
            PostgreSQL
          </Badge>
        ) : (
          <Badge variant="outline" className="border-yellow-500 text-yellow-400">
            GeneXus
          </Badge>
        ),
    },
    {
      id: "acciones",
      header: "Acciones",
      cell: ({ row }) => (
        <div className="space-x-2">
          {shouldShowImportButton(row.original) ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleImportUser(row.original)}
                disabled={importingUsers.has(row.original.UserExtendedId as number)}
              >
                {importingUsers.has(row.original.UserExtendedId as number) ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="ml-1">Importando...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span className="ml-1">Importar</span>
                  </>
                )}
              </Button>
              {importedUsers.has(row.original.UserExtendedId as number) && (
                <Badge variant="success">Importado</Badge>
              )}
            </>
          ) : (
            <>
              {isFromDB(row.original) && (
                <Button
                  variant="outline"
                  size="sm"
                  title="Visualizar permisos"
                  onClick={() =>
                    setPermisosModal({
                      userId: getUserId(row.original),
                      userName: getUserName(row.original),
                    })
                  }
                >
                  <ShieldCheck className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/dashboard/usuarios/editar/${getUserId(row.original)}`)}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteConfirm(row.original)}
              >
                <Trash className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  // =============================================
  // Filters / Actions
  // =============================================
  const filters = (
    <>
      <Select
        value={tipoUsuario}
        onValueChange={(v) => { setTipoUsuario(v); setPage(1); }}
      >
        <SelectTrigger className="w-44">
          {tipoUsuario === "sinImportar"
            ? "Sin importar (GX)"
            : tipoUsuario === "locales"
              ? "Locales (DB)"
              : "Todos (DB)"}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="locales">Locales (DB)</SelectItem>
          <SelectItem value="todos">Todos (DB)</SelectItem>
          <SelectItem value="sinImportar">Sin importar (GX)</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={estado}
        onValueChange={(v) => { setEstado(v); setPage(1); }}
      >
        <SelectTrigger className="w-32">
          {estado === "S" ? "Activo" : estado === "N" ? "Inactivo" : "Estado"}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="S">Activo</SelectItem>
          <SelectItem value="N">Inactivo</SelectItem>
          <SelectItem value="todos">Todos</SelectItem>
        </SelectContent>
      </Select>
    </>
  );

  const headerActions = (
    <Button
      onClick={() => router.push("/dashboard/usuarios/crear")}
      className="flex items-center gap-2"
    >
      <Plus className="w-4 h-4" />
      Nuevo Usuario
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
        searchPlaceholder="Buscar por nombre, email o documento..."
        filters={filters}
        headerActions={headerActions}
        emptyTitle="Sin usuarios"
        emptyDescription="No se encontraron usuarios con los filtros actuales."
        pageSizeOptions={[10, 25, 50]}
      />

      {permisosModal && (
        <VerPermisosModal
          isOpen
          onClose={() => setPermisosModal(null)}
          userId={permisosModal.userId}
          userName={permisosModal.userName}
        />
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}
        title="¿Desactivar este usuario?"
        description={`El usuario "${deleteConfirm ? getUserName(deleteConfirm) : ""}" será desactivado. Esta acción puede revertirse manualmente.`}
        confirmLabel="Desactivar"
        tone="danger"
        onConfirm={handleDeleteConfirm}
        loading={deleting}
      />
    </>
  );
}
