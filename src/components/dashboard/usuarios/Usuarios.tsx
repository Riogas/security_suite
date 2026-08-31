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
import {
  apiUsuariosDB,
  apiEliminarUsuarioDB,
  apiUsuariosExternos,
  apiImportarUsuariosDB,
} from "@/services/api";
import { BadgeOrigen } from "@/components/dashboard/usuarios/importar/badges";
import VerPermisosModal from "@/components/dashboard/usuarios/VerPermisosModal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BotonRoot } from "@/components/ui/solo-root";
import {
  Pencil,
  Trash,
  Download,
  Mail,
  Phone,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Unified row type: filas locales vienen con _source="db", filas de
// orígenes externos (SGM/LDAP/GSIST) con _source="externo".
// Using index signature to allow claves dinámicas de cada origen.
type UsuarioRow = {
  _source: "db" | "externo";
  [key: string]: unknown;
};

export default function UsuariosTable() {
  const [rows, setRows] = useState<UsuarioRow[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [estado, setEstado] = useState("todos");
  // "locales" | "ext:todos" | "ext:SGM" | "ext:LDAP" | "ext:GSIST"
  const [modo, setModo] = useState("locales");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [importingUsers, setImportingUsers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [permisosModal, setPermisosModal] = useState<{ userId: number; userName: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<UsuarioRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importConfirm, setImportConfirm] = useState<UsuarioRow | null>(null);
  const router = useRouter();
  // El "¿puedo?" ya no se resuelve acá: lo resuelve `BotonRoot` por dentro,
  // contra `usePuedeAdministrar()`. Root se le sigue preguntando a secapi
  // (`GET /api/db/usuarios/yo`) y no a `localStorage.user.isRoot`, que lo
  // escribe el login de GeneXus con USEREXTENDED.USEREXTENDEDESROOT y en
  // producción está INVERTIDO respecto de esta base.

  // debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  // =============================================
  // Fetchers
  // =============================================
  const fetcherExternos = async (opts: {
    origen: "todos" | "SGM" | "LDAP" | "GSIST";
    filtro: string;
    page: number;
    pageSize: number;
    signal?: AbortSignal;
  }) => {
    const res = await apiUsuariosExternos({
      origen: opts.origen,
      filtro: opts.filtro,
      estadoComparacion: "NUEVO",
      page: opts.page,
      pageSize: opts.pageSize,
      signal: opts.signal,
    });
    return { items: res.items as unknown as Record<string, unknown>[], total: res.total };
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

  // El filtro de Estado no aplica a los modos "ext:*" (fetcherExternos nunca
  // lo manda, y el control ni siquiera se muestra en ese modo — ver
  // `filters` más abajo). Esta copia estable evita que un `estado` que quedó
  // en memoria de un cambio de modo anterior dispare una re-enumeración
  // completa del AS400 para devolver exactamente lo mismo.
  const estadoEfectivo = modo.startsWith("ext:") ? "todos" : estado;

  // load
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);

        if (modo.startsWith("ext:")) {
          const origen = modo.slice(4) as "todos" | "SGM" | "LDAP" | "GSIST";
          const { items, total: fetchedTotal } = await fetcherExternos({
            origen,
            filtro: debouncedSearch,
            page,
            pageSize,
            signal: ac.signal,
          });
          setRows(items.map((u) => ({ ...u, _source: "externo" as const })));
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
  }, [debouncedSearch, estadoEfectivo, modo, page, pageSize]);

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
      : String(row.nombre ?? "Sin nombre");

  const getUserUsername = (row: UsuarioRow): string =>
    row._source === "db"
      ? String(row.username ?? "sin-usuario")
      : String(row.username ?? "sin-usuario");

  const getUserEmail = (row: UsuarioRow): string | undefined =>
    row._source === "db"
      ? (row.email as string | null | undefined) ?? undefined
      : (row.email as string | null | undefined) ?? undefined;

  const getUserId = (row: UsuarioRow): number =>
    row._source === "db" ? (row.id as number) : 0;

  const getUserTelefono = (row: UsuarioRow): string | undefined =>
    row._source === "db"
      ? (row.telefono as string | null | undefined) ?? undefined
      : undefined;

  const getUserEstado = (row: UsuarioRow): boolean => {
    if (row._source === "db") return row.estado === "A";
    return Boolean(row.habilitado);
  };

  const isFromDB = (row: UsuarioRow): boolean => row._source === "db";

  const shouldShowImportButton = (user: UsuarioRow): boolean =>
    user._source === "externo" && user.estadoComparacion === "NUEVO";

  const handleImportUser = async (user: UsuarioRow) => {
    const username = String(user.username || "");
    const origen = String(user.origen || "") as "SGM" | "LDAP" | "GSIST";
    if (!username || !origen) return;
    // Mismo criterio que el wizard (PasoComparacion.tsx:176,180): preferencias
    // y roles solo aplican a SGM. Importar de a uno tiene que pedir el mismo
    // consentimiento que el wizard para la misma operación, no menos — antes
    // esto otorgaba el rol Despacho a cualquier usuario de LDAP/GSIST sin que
    // conRoles tuviera ningún sentido para esos orígenes.
    const conPreferencias = origen === "SGM";
    const conRoles = origen === "SGM";
    try {
      setImportingUsers((prev) => new Set(prev).add(username));
      const res = await apiImportarUsuariosDB({
        origen,
        usernames: [username],
        conPreferencias,
        conRoles,
      });
      if (res.creados === 1) {
        toast.success(`Usuario ${username} importado`);
        setRows((prev) => prev.filter((r) => r.username !== username));
      } else {
        toast.error(res.detalles[0]?.motivo || "No se pudo importar");
      }
    } catch (error) {
      toast.error("Error al importar: " + (error as Error).message);
    } finally {
      setImportingUsers((prev) => {
        const s = new Set(prev);
        s.delete(username);
        return s;
      });
      setImportConfirm(null);
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
      cell: ({ row }) =>
        row.original._source === "db" ? (
          <Badge variant="secondary">ID: {getUserId(row.original)}</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">Sin asignar</Badge>
        ),
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
        row.original._source === "db" ? (
          <BadgeOrigen origen={row.original.desdeSistema as string | null} />
        ) : (
          <BadgeOrigen origen={row.original.origen as string} />
        ),
    },
    {
      id: "acciones",
      header: "Acciones",
      cell: ({ row }) => {
        const username = String(row.original.username || "");
        return (
          <div className="space-x-2">
            {shouldShowImportButton(row.original) ? (
              // POST /api/db/usuarios/importar es nivel ROOT.
              <BotonRoot
                variant="secondary"
                size="sm"
                // Pide confirmación antes de crear, igual que el wizard
                // (ConfirmDialog más abajo) — importar de a uno es la misma
                // operación que "Importar N usuarios" del paso 2, y ahí
                // hace falta confirmar.
                onClick={() => setImportConfirm(row.original)}
                disabled={importingUsers.has(username)}
              >
                {importingUsers.has(username) ? (
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
              </BotonRoot>
            ) : (
              isFromDB(row.original) && (
                <>
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
                  {/*
                    "Editar" NO se gatea: PUT /api/db/usuarios/:id sigue en
                    nivel AUTENTICADA, así que un no-root entra a la ficha y
                    guarda igual. Lo que ahí adentro SÍ está cerrado (asignar
                    roles y funcionalidades) se gatea en UsuarioForm.
                  */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/dashboard/usuarios/editar/${getUserId(row.original)}`)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  {/*
                    La baja sí: DELETE /api/db/usuarios/:id subió a ROOT porque
                    dar de baja a los dos roots deja la instalación sin
                    administrador (`resolveUsuario` no autentica inactivos).
                  */}
                  <BotonRoot
                    variant="destructive"
                    size="sm"
                    aria-label={`Desactivar usuario ${getUserName(row.original)}`}
                    onClick={() => setDeleteConfirm(row.original)}
                  >
                    <Trash className="w-4 h-4" />
                  </BotonRoot>
                </>
              )
            )}
          </div>
        );
      },
    },
  ];

  // =============================================
  // Filters / Actions
  // =============================================
  const filters = (
    <>
      <Select value={modo} onValueChange={(v) => { setModo(v); setPage(1); }}>
        <SelectTrigger className="w-56">
          {{
            locales: "Locales (PostgreSQL)",
            "ext:todos": "Sin importar — todos",
            "ext:SGM": "Sin importar — SGM",
            "ext:LDAP": "Sin importar — LDAP",
            "ext:GSIST": "Sin importar — ADMSEC/GSIST",
          }[modo] ?? "Locales (PostgreSQL)"}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="locales">Locales (PostgreSQL)</SelectItem>
          <SelectItem value="ext:todos">Sin importar — todos</SelectItem>
          <SelectItem value="ext:SGM">Sin importar — SGM</SelectItem>
          <SelectItem value="ext:LDAP">Sin importar — LDAP</SelectItem>
          <SelectItem value="ext:GSIST">Sin importar — ADMSEC/GSIST</SelectItem>
        </SelectContent>
      </Select>
      {/* No aplica a los modos "ext:*": fetcherExternos nunca manda `estado`,
          así que ahí es un control que no hace nada (y cambiarlo disparaba
          una re-enumeración completa del AS400 para el mismo resultado). */}
      {!modo.startsWith("ext:") && (
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
      )}
    </>
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

      <ConfirmDialog
        open={importConfirm !== null}
        onOpenChange={(open) => { if (!open) setImportConfirm(null); }}
        title={`¿Importar a "${importConfirm ? getUserUsername(importConfirm) : ""}"?`}
        description={
          importConfirm
            ? `Se va a crear el usuario "${getUserUsername(importConfirm)}" desde ${String(importConfirm.origen || "")}. ` +
              `Preferencias: ${importConfirm.origen === "SGM" ? "sí" : "no"}. ` +
              `Roles: ${importConfirm.origen === "SGM" ? "sí" : "no"}.`
            : undefined
        }
        confirmLabel="Importar"
        tone="default"
        onConfirm={() => {
          if (importConfirm) return handleImportUser(importConfirm);
        }}
        loading={importConfirm ? importingUsers.has(String(importConfirm.username || "")) : false}
      />
    </>
  );
}
