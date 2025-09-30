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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { apiUsuarios, apiImportarUsuario } from "@/services/api";
import {
  Pencil,
  Trash,
  Download,
  Mail,
  Phone,
  Calendar,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function UsuariosTable() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [estado, setEstado] = useState("todos");
  const [sinMigrar, setSinMigrar] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [importingUsers, setImportingUsers] = useState<Set<number>>(new Set());
  const [importedUsers, setImportedUsers] = useState<Set<number>>(new Set());
  const router = useRouter();

  // debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const fetcher = async (opts: {
    FiltroTexto: string;
    Estado: string;
    sinMigrar: boolean;
    Pagesize: number;
    CurrentPage: number;
    signal?: AbortSignal;
  }) => {
    const res = await apiUsuarios(
      {
        FiltroTexto: opts.FiltroTexto,
        Estado: opts.Estado,
        sinMigrar: opts.sinMigrar,
        Pagesize: String(opts.Pagesize),
        CurrentPage: String(opts.CurrentPage),
      },
      { signal: opts.signal },
    );
    const items = res?.SdtUsuarios || res?.sdtUsuarios || res?.items || [];
    const total = Number(
      res?.MaxRegistros ??
        res?.maxRegistros ??
        res?.total ??
        (items?.length || 0),
    );
    return { items, total };
  };

  // load
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const { items, total } = await fetcher({
          FiltroTexto: debouncedSearch,
          Estado: estado === "S" ? "S" : estado === "N" ? "N" : "",
          sinMigrar,
          Pagesize: pageSize,
          CurrentPage: pageIndex + 1,
          signal: ac.signal,
        });
        setRows(items);
        setTotalPages(Math.max(1, Math.ceil(Number(total) / pageSize)) || 0);
      } catch (e: any) {
        if (e?.name !== "AbortError")
          console.error("Error cargando usuarios:", e);
      }
    })();
    return () => ac.abort();
  }, [debouncedSearch, estado, sinMigrar, pageIndex, pageSize]);

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
        AplicacionId: 2, // Security Suite por defecto
      });

      if (response.success) {
        console.log(
          `Usuario ${user?.UserExtendedNombre} importado exitosamente`,
        );
        setImportedUsers((prev) => new Set(prev).add(userId));

        // Opcional: Actualizar la lista de usuarios
        // Podrías recargar los datos o actualizar el estado local
      } else {
        console.error("Error al importar usuario:", response.message);
      }
    } catch (error) {
      console.error("Error en la importación:", error);
    } finally {
      setImportingUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  // Función para determinar si un usuario debe mostrar el botón de importar
  const shouldShowImportButton = (user: any) => {
    const userId = user?.UserExtendedId;
    // Solo mostrar el botón si:
    // 1. Está activado el filtro "Sin importar"
    // 2. El usuario no ha sido importado previamente
    // 3. El usuario tiene los campos necesarios
    return (
      sinMigrar &&
      userId &&
      !importedUsers.has(userId) &&
      user?.UserExtendedNombre
    ); // Verificar que tiene datos básicos
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
          <div className="flex items-center gap-2">
            <Switch
              checked={sinMigrar}
              onCheckedChange={(v) => {
                setSinMigrar(v);
                setPageIndex(0);
              }}
            />
            <span>Sin importar</span>
          </div>
          <Select
            value={estado}
            onValueChange={(v) => {
              setEstado(v);
              setPageIndex(0);
            }}
          >
            <SelectTrigger>
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
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                <TableCell>
                  <div className="flex items-center space-x-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="text-xs">
                        {getInitials(row?.UserExtendedNombre || "")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">
                        {row?.UserExtendedNombre || "Sin nombre"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        @{row?.UserExtendedUserName || "sin-usuario"}
                      </div>
                      {row?.UserExtendedEmail && (
                        <div className="text-sm text-muted-foreground flex items-center">
                          <Mail className="w-3 h-3 mr-1" />
                          {row?.UserExtendedEmail}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-mono text-sm">
                    {row?.UserExtendedUserName || "-"}
                  </div>
                </TableCell>
                <TableCell>
                  {(() => {
                    const esUsuarioExterno = row?.sinMigrar;
                    const tieneId = row?.UserExtendedId;

                    if (esUsuarioExterno) {
                      // Usuario externo que necesita ser importado - no tiene ID local
                      return (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          Sin asignar
                        </Badge>
                      );
                    } else {
                      // Usuario que existe en el sistema local - mostrar ID
                      return (
                        <Badge variant="secondary">ID: {tieneId || "-"}</Badge>
                      );
                    }
                  })()}
                </TableCell>
                <TableCell>
                  {row?.UserExtendedTelefono ? (
                    <div className="flex items-center text-sm">
                      <Phone className="w-3 h-3 mr-1" />
                      {row?.UserExtendedTelefono}
                    </div>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell>
                  {(() => {
                    const estado = row?.UserExtendedEstado;
                    const activo = estado === "S" || estado === "A";
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
                  <div className="space-x-2">
                    {shouldShowImportButton(row) ? (
                      // Usuario externo - solo mostrar importar
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
                      // Usuario local - mostrar editar y eliminar
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            router.push(
                              `/dashboard/usuarios/editar/${row?.UserExtendedId || ""}`,
                            )
                          }
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => console.log("Eliminar usuario", row)}
                        >
                          <Trash className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
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
    </div>
  );
}
