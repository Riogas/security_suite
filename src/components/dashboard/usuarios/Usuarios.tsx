"use client";

import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiUsuarios, apiImportarUsuario, apiUsuariosDB, apiEliminarUsuarioDB } from "@/services/api";
import VerPermisosModal from "@/components/dashboard/usuarios/VerPermisosModal";
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

export default function UsuariosTable() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [estado, setEstado] = useState("todos");
  const [tipoUsuario, setTipoUsuario] = useState("locales"); // "locales" | "sinImportar" | "todos"
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [importingUsers, setImportingUsers] = useState<Set<number>>(new Set());
  const [importedUsers, setImportedUsers] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [permisosModal, setPermisosModal] = useState<{ userId: number; userName: string } | null>(null);
  const router = useRouter();

  // debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  // =============================================
  // Fetcher para GeneXus (usuarios sin importar)
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
    const total = Number(
      res?.MaxRegistros ?? res?.maxRegistros ?? res?.total ?? (items?.length || 0),
    );
    return { items, total };
  };

  // =============================================
  // Fetcher para PostgreSQL (usuarios locales/migrados)
  // =============================================
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
    return { items: res.items, total: res.total };
  };

  // load
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);

        if (tipoUsuario === "sinImportar") {
          // ========== GeneXus API ==========
          const estadoGx = estado === "S" ? "S" : estado === "N" ? "N" : "";
          const { items, total } = await fetcherGeneXus({
            FiltroTexto: debouncedSearch,
            Estado: estadoGx,
            Pagesize: pageSize,
            CurrentPage: pageIndex + 1,
            signal: ac.signal,
          });
          // Normalizar a formato con _source para saber el origen
          const normalized = items.map((u: any) => ({ ...u, _source: "genexus" }));
          setRows(normalized);
          setTotalPages(Math.max(1, Math.ceil(Number(total) / pageSize)) || 0);
        } else {
          // ========== PostgreSQL (Prisma) ==========
          // "locales" o "todos" → traer de la DB
          const estadoDB = estado === "S" ? "A" : estado === "N" ? "I" : "";
          const { items, total } = await fetcherDB({
            filtro: debouncedSearch,
            estado: estadoDB,
            page: pageIndex + 1,
            pageSize,
            signal: ac.signal,
          });
          // Normalizar a formato compatible con la tabla
          const normalized = items.map((u: any) => ({ ...u, _source: "db" }));
          setRows(normalized);
          setTotalPages(Math.max(1, Math.ceil(Number(total) / pageSize)) || 0);
        }
      } catch (e: any) {
        if (e?.name !== "AbortError")
          console.error("Error cargando usuarios:", e);
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [debouncedSearch, estado, tipoUsuario, pageIndex, pageSize]);

  const getInitials = (nombre: string) => {
    if (!nombre || nombre.trim() === "" || nombre === "undefined") return "U";
    const words = nombre
      .trim()
      .split(" ")
      .filter((word) => word.length > 0);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return nombre.substring(0, 1).toUpperCase() || "U";
  };

  // =============================================
  // Helpers para acceder a datos normalizados (DB vs GeneXus)
  // =============================================
  const getUserName = (row: any) =>
    row._source === "db"
      ? `${row.nombre || ""} ${row.apellido || ""}`.trim() || row.username
      : row?.UserExtendedNombre || "Sin nombre";

  const getUserUsername = (row: any) =>
    row._source === "db" ? row.username : row?.UserExtendedUserName || "sin-usuario";

  const getUserEmail = (row: any) =>
    row._source === "db" ? row.email : row?.UserExtendedEmail;

  const getUserId = (row: any) =>
    row._source === "db" ? row.id : row?.UserExtendedId;

  const getUserTelefono = (row: any) =>
    row._source === "db" ? row.telefono : row?.UserExtendedTelefono;

  const getUserEstado = (row: any) => {
    if (row._source === "db") {
      return row.estado === "A";
    }
    const est = row?.UserExtendedEstado;
    return est === "S" || est === "A";
  };

  const isFromDB = (row: any) => row._source === "db";

  // Función para importar un usuario del sistema externo
  const handleImportUser = async (user: any) => {
    const userId = user?.UserExtendedId;
    if (!userId) {
      console.error("ID de usuario no válido");
      return;
    }

    try {
      setImportingUsers((prev) => new Set(prev).add(userId));

      const response = await apiImportarUsuario({
        UserExtendedId: userId,
        AplicacionId: 2,
      });

      if (response.success) {
        toast.success(`Usuario ${user?.UserExtendedNombre} importado exitosamente`);
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

  // Eliminar (desactivar) usuario de la DB
  const handleDeleteUser = async (row: any) => {
    const id = getUserId(row);
    if (!id || !confirm("¿Estás seguro de desactivar este usuario?")) return;

    try {
      await apiEliminarUsuarioDB(id);
      toast.success("Usuario desactivado correctamente");
      // Recargar
      setRows((prev) => prev.filter((r) => getUserId(r) !== id));
    } catch (error: any) {
      toast.error("Error al desactivar: " + error.message);
    }
  };

  // Determinar si un usuario muestra botón importar
  const shouldShowImportButton = (user: any) => {
    const userId = user?.UserExtendedId;
    return (
      tipoUsuario === "sinImportar" &&
      userId &&
      !importedUsers.has(userId) &&
      user?.UserExtendedNombre
    );
  };

  return (
    <div>
      <div className="flex justify-between items-end mb-4">
        <Input
          placeholder="Buscar por nombre, email o documento..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPageIndex(0);
          }}
          className="w-1/2"
        />
        <div className="flex gap-4 items-end">
          <Select
            value={tipoUsuario}
            onValueChange={(v) => {
              setTipoUsuario(v);
              setPageIndex(0);
            }}
          >
            <SelectTrigger className="w-[180px]">
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
            onValueChange={(v) => {
              setEstado(v);
              setPageIndex(0);
            }}
          >
            <SelectTrigger className="w-[180px]">
              {estado === "S"
                ? "Activo"
                : estado === "N"
                  ? "Inactivo"
                  : "Estado"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="S">Activo</SelectItem>
              <SelectItem value="N">Inactivo</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => router.push("/dashboard/usuarios/crear")}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo Usuario
          </Button>
        </div>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Nombre de Usuario</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No se encontraron usuarios
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => (
                <TableRow key={getUserId(row) || index}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="text-xs">
                          {getInitials(getUserName(row))}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {getUserName(row)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          @{getUserUsername(row)}
                        </div>
                        {getUserEmail(row) && (
                          <div className="text-sm text-muted-foreground flex items-center">
                            <Mail className="w-3 h-3 mr-1" />
                            {getUserEmail(row)}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-sm">
                      {getUserUsername(row)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isFromDB(row) ? (
                      <Badge variant="secondary">ID: {getUserId(row)}</Badge>
                    ) : row?.sinMigrar ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        Sin asignar
                      </Badge>
                    ) : (
                      <Badge variant="secondary">ID: {getUserId(row) || "-"}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {getUserTelefono(row) ? (
                      <div className="flex items-center text-sm">
                        <Phone className="w-3 h-3 mr-1" />
                        {getUserTelefono(row)}
                      </div>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const activo = getUserEstado(row);
                      return (
                        <Badge
                          className={
                            activo
                              ? "bg-green-900 text-green-200"
                              : "bg-red-900 text-red-200"
                          }
                        >
                          {activo ? "Activo" : "Inactivo"}
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {isFromDB(row) ? (
                      <Badge variant="outline" className="border-blue-500 text-blue-400">
                        PostgreSQL
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-yellow-500 text-yellow-400">
                        GeneXus
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-x-2">
                      {shouldShowImportButton(row) ? (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleImportUser(row)}
                            disabled={importingUsers.has(row?.UserExtendedId)}
                          >
                            {importingUsers.has(row?.UserExtendedId) ? (
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
                          {importedUsers.has(row?.UserExtendedId) && (
                            <Badge
                              variant="default"
                              className="bg-green-600 text-white"
                            >
                              ✓ Importado
                            </Badge>
                          )}
                        </>
                      ) : (
                        <>
                          {isFromDB(row) && (
                            <Button
                              variant="outline"
                              size="sm"
                              title="Visualizar permisos"
                              onClick={() =>
                                setPermisosModal({
                                  userId: getUserId(row),
                                  userName: getUserName(row),
                                })
                              }
                            >
                              <ShieldCheck className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              router.push(
                                `/dashboard/usuarios/editar/${getUserId(row)}`,
                              )
                            }
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteUser(row)}
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex justify-between items-center mt-2 p-2">
          <div className="flex items-center gap-2">
            <span>Registros por página</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                const ps = Number(v);
                setPageSize(ps);
                setPageIndex(0);
              }}
            >
              <SelectTrigger>{pageSize}</SelectTrigger>
              <SelectContent>
                {[10, 25, 50].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span>
            Página {pageIndex + 1} de {Math.max(1, totalPages)}
          </span>
          <div className="flex items-center gap-2">
            <Button onClick={() => setPageIndex(0)} disabled={pageIndex === 0}>
              «
            </Button>
            <Button
              onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
              disabled={pageIndex === 0}
            >
              ‹
            </Button>
            <Button
              onClick={() =>
                setPageIndex(Math.min(totalPages - 1, pageIndex + 1))
              }
              disabled={pageIndex >= totalPages - 1}
            >
              ›
            </Button>
            <Button
              onClick={() => setPageIndex(totalPages - 1)}
              disabled={pageIndex >= totalPages - 1}
            >
              »
            </Button>
          </div>
        </div>
      </div>

      {permisosModal && (
        <VerPermisosModal
          isOpen
          onClose={() => setPermisosModal(null)}
          userId={permisosModal.userId}
          userName={permisosModal.userName}
        />
      )}
    </div>
  );
}
