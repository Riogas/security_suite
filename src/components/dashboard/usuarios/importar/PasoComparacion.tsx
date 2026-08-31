"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BotonRoot } from "@/components/ui/solo-root";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ColumnDef } from "@tanstack/react-table";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  apiImportarUsuariosDB,
  apiUsuariosExternos,
  type EstadoComparacionUI,
  type ImportarUsuariosResult,
  type UsuarioExternoRow,
} from "@/services/api";
import { BadgeComparacion, BadgeOrigen } from "./badges";
import type { OpcionesImport } from "./PasoOrigen";

const CHIPS: { key: EstadoComparacionUI | "todos"; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "NUEVO", label: "Nuevos" },
  { key: "MIGRADO", label: "Migrados" },
  { key: "DIFIERE", label: "Difieren" },
  { key: "CONFLICTO", label: "Conflictos" },
];

/** Solo los NUEVO se pueden importar; los CONFLICTO reventarían el insert. */
function esImportable(u: UsuarioExternoRow): boolean {
  return u.estadoComparacion === "NUEVO";
}

export default function PasoComparacion({
  opciones,
  onImportado,
}: {
  opciones: OpcionesImport;
  onImportado: (r: ImportarUsuariosResult) => void;
}) {
  const [rows, setRows] = useState<UsuarioExternoRow[]>([]);
  const [resumen, setResumen] = useState({
    nuevos: 0,
    migrados: 0,
    difieren: 0,
    conflictos: 0,
    preseleccionados: 0,
  });
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoComparacionUI | "todos">("NUEVO");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [importando, setImportando] = useState(false);

  // Modelo de selección: guardar lo tildado no sirve — son 429 filas en 18
  // páginas y en pantalla solo está una. Se guarda el MODO más dos conjuntos
  // de excepciones, que se mantienen disjuntos:
  //   excluidos → filas que VENÍAN preseleccionadas y el operador destildó
  //   incluidos → filas que NO venían preseleccionadas y el operador tildó
  //               (el caso de las cuentas de sistema, que se pueden importar
  //                pero no vienen marcadas)
  const [todoElFiltro, setTodoElFiltro] = useState(true);
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [incluidos, setIncluidos] = useState<Set<string>>(new Set());

  const estaTildado = useCallback(
    (u: UsuarioExternoRow) => {
      if (!esImportable(u)) return false;
      if (!todoElFiltro) return incluidos.has(u.username);
      if (u.preseleccionado) return !excluidos.has(u.username);
      return incluidos.has(u.username);
    },
    [todoElFiltro, excluidos, incluidos],
  );

  // `preseleccionados`, NO `nuevos`: las cuentas de sistema son NUEVO pero
  // arrancan destildadas, así que contarlas prometería importar de más.
  // Los dos conjuntos son disjuntos, por eso se suman sin miedo a duplicar.
  const cantidadSeleccionada = todoElFiltro
    ? Math.max(0, resumen.preseleccionados - excluidos.size) + incluidos.size
    : incluidos.size;
  const palabraUsuarios = cantidadSeleccionada === 1 ? "usuario" : "usuarios";
  const palabraNuevos = cantidadSeleccionada === 1 ? "nuevo" : "nuevos";

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setCargando(true);
        const res = await apiUsuariosExternos({
          origen: opciones.origen,
          filtro: opciones.filtro,
          estadoComparacion: estadoFiltro,
          incluirDeshabilitados: opciones.incluirDeshabilitados,
          page,
          pageSize,
          signal: ac.signal,
        });
        setRows(res.items);
        setTotal(res.total);
        setResumen(res.resumen);
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") {
          toast.error("Error cargando la comparación: " + (e as Error).message);
        }
      } finally {
        setCargando(false);
      }
    })();
    return () => ac.abort();
  }, [opciones, estadoFiltro, page, pageSize]);

  const alternarFila = (u: UsuarioExternoRow, tildar: boolean) => {
    // Con "todo el filtro" activo, una fila que venía preseleccionada se mueve
    // en `excluidos`; una que NO venía (cuenta de sistema) se mueve en
    // `incluidos`. Así los dos conjuntos nunca se pisan y el contador cierra.
    const usaExcluidos = todoElFiltro && u.preseleccionado;
    const setter = usaExcluidos ? setExcluidos : setIncluidos;
    const agregaAlTildar = !usaExcluidos;

    setter((prev) => {
      const s = new Set(prev);
      if (tildar === agregaAlTildar) s.add(u.username);
      else s.delete(u.username);
      return s;
    });
  };

  /**
   * Junta los usernames a importar. Con `todoElFiltro` hay que traerlos todos
   * del servidor, porque en pantalla solo está la página actual.
   */
  const resolverUsernames = async (): Promise<string[]> => {
    if (!todoElFiltro) return [...incluidos];

    const TAMANIO = 500;
    const acumulado: string[] = [];
    let pagina = 1;
    for (;;) {
      const res = await apiUsuariosExternos({
        origen: opciones.origen,
        filtro: opciones.filtro,
        estadoComparacion: "NUEVO",
        incluirDeshabilitados: opciones.incluirDeshabilitados,
        page: pagina,
        pageSize: TAMANIO,
      });
      acumulado.push(
        ...res.items
          .filter((u) =>
            u.preseleccionado ? !excluidos.has(u.username) : incluidos.has(u.username),
          )
          .map((u) => u.username),
      );
      if (pagina >= res.totalPages || res.items.length === 0) break;
      pagina++;
    }
    return acumulado;
  };

  const importar = async () => {
    setImportando(true);
    try {
      const usernames = await resolverUsernames();
      if (usernames.length === 0) {
        toast.warning("No hay usuarios seleccionados");
        return;
      }
      const res = await apiImportarUsuariosDB({
        origen: opciones.origen,
        usernames,
        conPreferencias: opciones.origen === "SGM" && opciones.conPreferencias,
        // Igual que conPreferencias: el switch de roles solo aplica a SGM
        // (ver PasoOrigen.tsx), así que se fuerza acá por si quedó `true` en
        // el estado de un cambio de origen previo.
        conRoles: opciones.origen === "SGM" && opciones.conRoles,
      });
      onImportado(res);
    } catch (e) {
      toast.error("Error importando: " + (e as Error).message);
    } finally {
      setImportando(false);
      setConfirmando(false);
    }
  };

  const columns: ColumnDef<UsuarioExternoRow, unknown>[] = [
    {
      id: "sel",
      header: () => (
        <Checkbox
          checked={todoElFiltro}
          onCheckedChange={(v) => {
            setTodoElFiltro(Boolean(v));
            setExcluidos(new Set());
            setIncluidos(new Set());
          }}
          aria-label="Seleccionar todos los del filtro"
        />
      ),
      cell: ({ row }) => {
        const u = row.original;
        if (u.estadoComparacion === "CONFLICTO") {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Checkbox disabled aria-label="No importable" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                El email ya lo tiene el usuario «{u.conflictoCon}»
              </TooltipContent>
            </Tooltip>
          );
        }
        return (
          <Checkbox
            disabled={!esImportable(u)}
            checked={estaTildado(u)}
            onCheckedChange={(v) => alternarFila(u, Boolean(v))}
            aria-label={`Seleccionar ${u.username}`}
          />
        );
      },
    },
    {
      id: "usuario",
      header: "Usuario",
      cell: ({ row }) => (
        <div>
          <div className="font-mono text-sm font-medium">{row.original.username}</div>
          {row.original.nombre && (
            <div className="text-sm text-muted-foreground">{row.original.nombre}</div>
          )}
          {row.original.esCuentaSistema && (
            <Badge variant="outline" className="mt-1 border-amber-500 text-amber-400 text-[10px]">
              cuenta de sistema
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "email",
      header: "Email",
      cell: ({ row }) => row.original.email || <span className="text-muted-foreground">—</span>,
    },
    {
      id: "origen",
      header: "Origen",
      cell: ({ row }) => <BadgeOrigen origen={row.original.origen} />,
    },
    {
      id: "estadoOrigen",
      header: "En el origen",
      cell: ({ row }) => (
        <Badge variant={row.original.habilitado ? "success" : "secondary"}>
          {row.original.habilitado ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    {
      id: "comparacion",
      header: "Comparación",
      cell: ({ row }) => <BadgeComparacion estado={row.original.estadoComparacion} />,
    },
    {
      id: "diffs",
      header: "Diferencias",
      cell: ({ row }) => {
        const d = row.original.diffs;
        if (!d?.length) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="space-y-0.5 text-xs">
            {d.map((x, i) => (
              <div key={i}>
                <span className="font-medium">{x.campo}:</span>{" "}
                <span className="text-muted-foreground">{x.local ?? "—"}</span>
                {" → "}
                <span>{x.externo ?? "—"}</span>
              </div>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {CHIPS.map(({ key, label }) => {
          const n =
            key === "todos"
              ? resumen.nuevos + resumen.migrados + resumen.difieren + resumen.conflictos
              : key === "NUEVO"
                ? resumen.nuevos
                : key === "MIGRADO"
                  ? resumen.migrados
                  : key === "DIFIERE"
                    ? resumen.difieren
                    : resumen.conflictos;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { setEstadoFiltro(key); setPage(1); }}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                estadoFiltro === key ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
              }`}
            >
              <span className="font-semibold">{n}</span> {label}
            </button>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={cargando}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        emptyTitle="Sin resultados"
        emptyDescription="No hay usuarios con los filtros actuales."
        pageSizeOptions={[25, 50, 100]}
      />

      <div className="flex justify-end">
        {/* POST /api/db/usuarios/importar es nivel ROOT. */}
        <BotonRoot onClick={() => setConfirmando(true)} disabled={cantidadSeleccionada === 0 || importando}>
          {importando ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</>
          ) : (
            <><Upload className="w-4 h-4 mr-2" />Importar {cantidadSeleccionada} {palabraUsuarios}</>
          )}
        </BotonRoot>
      </div>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title={`¿Importar ${cantidadSeleccionada} ${palabraUsuarios} desde ${opciones.origen}?`}
        description={
          `Se van a crear ${cantidadSeleccionada} ${palabraUsuarios} ${palabraNuevos}. Los que ya existen no se tocan. ` +
          `Preferencias: ${opciones.origen === "SGM" && opciones.conPreferencias ? "sí" : "no"}. ` +
          `Roles: ${opciones.origen === "SGM" && opciones.conRoles ? "sí" : "no"}.`
        }
        confirmLabel="Importar"
        tone="default"
        onConfirm={importar}
        loading={importando}
      />
    </div>
  );
}
