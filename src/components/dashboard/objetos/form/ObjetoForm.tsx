"use client";

import { apiAbmObjetos, apiListarObjetos, type ListarObjetosItem } from "@/services/api";
import { useEffect, useMemo, useState, memo, useRef } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Link2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import IconPicker, { IconName } from "@/components/dashboard/iconpicker";


// ✅ FUERA de ObjetoForm (ámbito de módulo)
type SortableRowProps = {
  id: string;
  disabled?: boolean;
  children: React.ReactNode;
};

export const SortableRow = memo(function SortableRow({
  id,
  disabled,
  children,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? "hsl(var(--muted))" : undefined,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-8">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="cursor-grab active:cursor-grabbing"
          {...(!disabled ? { ...listeners, ...attributes } : {})}
          title="Arrastrar para reordenar"
          disabled={disabled}
        >
          <GripVertical className="w-4 h-4" />
        </Button>
      </TableCell>
      {children}
    </TableRow>
  );
});

// Generador de códigos estable basado en Web Crypto (Base32 tipo XXXX-XXXX)
const ROUTE_SALT = "OBJ-ACCION-V1";
async function routeCode(pathname: string, salt: string = ROUTE_SALT): Promise<string> {
  const enc = new TextEncoder().encode(`${salt}|${pathname}`);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(digest);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    value = 0,
    out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  const code = out.replace(/[^A-Z2-7]/g, "").slice(0, 8) || "AAAAAAAA";
  return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

// Helper: combinar objetokey + accionkey para el hash
function buildActionHashInput(objectKey: string, actionKey: string) {
  return `${(objectKey || "").trim()}|${(actionKey || "").trim()}`;
}

async function generateActionCode(objectKey: string, actionKey: string) {
  const src = buildActionHashInput(objectKey, actionKey);
  if (!src || src === "|") return "";
  return routeCode(src);
}

export type EstadoCode = "A" | "I";
export type TipoCode = "MENU" | "SUBMENU" | "PAGE" | "FEATURE";

const APP_OPTIONS = [
  { value: "1", label: "Security Suite" },
  { value: "2", label: "Gestión de Sistemas" },
  { value: "3", label: "GOYA" },
  { value: "4", label: "SGM" },
] as const;

export type Accion = {
  uid: string;
  accionid: string;
  accionkey: string;
  acciondescripcion: string;
  accioncreadoen: string;
  accioncodigo: string;
  accionlabel: string;
  accionpath: string;
  accionicon: string;
  accionrelacion: string;
};

function genUid() {
  // Stable random id in client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (typeof crypto !== "undefined" && (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).slice(2));
}

export type ObjetoFormState = {
  objetoid: string;
  aplicacionid: string;
  objetotipo: TipoCode;
  objetokey: string;
  objetopath: string;
  objetolabel: string;
  objetoicon: string;
  objetoorder: number;
  objetoestado: EstadoCode;
  objetoespublico: boolean;
  objetocreadoen: string;
  acciones: Accion[];
};

export type ObjetoFormProps = {
  initialData?: Partial<ObjetoFormState>;
  onSubmit?: (data: ObjetoFormState) => void | Promise<void>;
};

export default function ObjetoForm({ initialData, onSubmit }: ObjetoFormProps) {
  const initialApp = APP_OPTIONS[0];
  const defaults: ObjetoFormState = {
    objetoid: "",
    aplicacionid: initialApp.value,
    objetotipo: "MENU",
    objetokey: "",
    objetopath: "",
    objetolabel: "",
    objetoicon: "",
    objetoorder: 0,
    objetoestado: "A",
    objetoespublico: false,
    objetocreadoen: initialApp.label,
    acciones: [],
  };

  const [form, setForm] = useState<ObjetoFormState>({
    ...defaults,
    ...(initialData ?? {}),
    objetocreadoen:
      initialData?.objetocreadoen ??
      (APP_OPTIONS.find((a) => a.value === (initialData?.aplicacionid ?? initialApp.value))?.label ?? initialApp.label),
    acciones: (initialData?.acciones ?? []).map((a, idx) => ({
      uid: (a as any).uid ?? genUid(),
      accionid: a.accionid ?? "",
      accionkey: a.accionkey ?? "",
      acciondescripcion: a.acciondescripcion ?? "",
      accioncreadoen:
        a.accioncreadoen ??
        (APP_OPTIONS.find((x) => x.value === (initialData?.aplicacionid ?? initialApp.value))?.label ?? initialApp.label),
      accioncodigo: a.accioncodigo ?? "",
      accionlabel: (a as any).accionlabel ?? "",
      accionpath: (a as any).accionpath ?? "",
      accionicon: (a as any).accionicon ?? "",
      accionrelacion: (a as any).accionrelacion ?? "",
    })),
  });

  useEffect(() => {
    if (!initialData) return;
    setForm((prev) => ({
      ...prev,
      ...initialData,
      objetocreadoen:
        initialData.objetocreadoen ??
        (APP_OPTIONS.find((a) => a.value === (initialData.aplicacionid ?? prev.aplicacionid))?.label ?? prev.objetocreadoen),
      acciones: (initialData.acciones ?? []).map((a) => ({
        uid: (a as any).uid ?? genUid(),
        accionid: a.accionid ?? "",
        accionkey: a.accionkey ?? "",
        acciondescripcion: a.acciondescripcion ?? "",
        accioncreadoen:
          a.accioncreadoen ??
          (APP_OPTIONS.find((x) => x.value === (initialData.aplicacionid ?? prev.aplicacionid))?.label ?? prev.objetocreadoen),
        accioncodigo: a.accioncodigo ?? "",
        accionlabel: (a as any).accionlabel ?? "",
        accionpath: (a as any).accionpath ?? "",
        accionicon: (a as any).accionicon ?? "",
        accionrelacion: (a as any).accionrelacion ?? "",
      })),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialData)]);

  const setField = <K extends keyof ObjetoFormState>(key: K, value: ObjetoFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const tipoEsMenu = form.objetotipo === "MENU";

  // Acciones tabla dinámica con paginación
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil((form.acciones.length + 1) / pageSize)); // +1 fila libre
  const [submitting, setSubmitting] = useState(false);
  const [relationOpen, setRelationOpen] = useState(false);
  const [relationRow, setRelationRow] = useState<number | null>(null);
  // Foco tras crear fila desde la fila libre
  const [pendingFocusUid, setPendingFocusUid] = useState<string | null>(null);
  const etiquetaFocusRef = useRef<HTMLInputElement | null>(null);
  // Estado para modal de objetos relacionados
  const [relationSearch, setRelationSearch] = useState("");
  const [relationPage, setRelationPage] = useState(1);
  const relationPageSize = 20;
  const [relationItems, setRelationItems] = useState<ListarObjetosItem[]>([]);
  const [relationTotal, setRelationTotal] = useState(0);
  const [relationLoading, setRelationLoading] = useState(false);
  // Labels a mostrar en la columna de relación (mostrar ObjetoKey, guardar ObjetoId)
  const [relationLabels, setRelationLabels] = useState<Record<string, string>>({});
  const [accionDraft, setAccionDraft] = useState<Accion>(() => ({
    uid: "free-row",
    accionid: "",
    accionkey: "",
    acciondescripcion: "",
    accioncreadoen: APP_OPTIONS.find((a) => a.value === (initialData?.aplicacionid ?? initialApp.value))?.label ?? initialApp.label,
    accioncodigo: "",
    accionlabel: "",
    accionpath: "",
    accionicon: "",
    accionrelacion: "",
  }));

  // Buffer local para campos opcionales por fila (evita perder foco al tipear)
  const [rowEdits, setRowEdits] = useState<Record<string, Partial<Accion>>>({});
  function setRowEdit(uid: string, patch: Partial<Accion>) {
    setRowEdits((prev) => ({ ...prev, [uid]: { ...(prev[uid] || {}), ...patch } }));
  }
  function getRowEditValue<T extends keyof Accion>(uid: string, key: T, fallback: Accion[T]) {
    const v = rowEdits[uid]?.[key];
    return (v as Accion[T]) ?? fallback;
  }
  function commitRowEdit<T extends keyof Accion>(uid: string, key: T, idxGlobal: number) {
    const v = rowEdits[uid]?.[key];
    if (typeof v === "undefined") return;
    upsertAccion(idxGlobal, { [key]: v } as Partial<Accion>);
    setRowEdits((prev) => {
      const copy = { ...prev } as Record<string, Partial<Accion>>;
      const obj = { ...(copy[uid] || {}) } as Partial<Accion>;
      delete (obj as any)[key];
      if (Object.keys(obj).length) copy[uid] = obj; else delete copy[uid];
      return copy;
    });
  }

  // DnD sensors
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const accionesPaginadas = useMemo(() => {
    const start = pageIndex * pageSize;
    const end = start + pageSize;
    const slice = form.acciones.slice(start, end);
    // Añadir fila libre si la página actual incluye el "slot" de la fila libre
    const needsFreeRow = end >= form.acciones.length + 1;
    return needsFreeRow ? [...slice, accionDraft] : slice;
  }, [form.acciones, pageIndex, accionDraft]);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromUid = String(active.id);
    const toUid = String(over.id);
    setForm((prev) => {
      const list = [...prev.acciones];
      const from = list.findIndex((a) => a.uid === fromUid);
      const to = list.findIndex((a) => a.uid === toUid);
      if (from < 0 || to < 0) return prev;
      const reordered = arrayMove(list, from, to);
      return { ...prev, acciones: reordered };
    });
  }

  function upsertAccion(idxGlobal: number, data: Partial<Accion>) {
    // Si es la fila libre, solo actualizar el borrador y evitar setForm para no perder el foco
    if (idxGlobal >= form.acciones.length) {
      setAccionDraft((prevDraft) => ({ ...prevDraft, ...data }));
      return;
    }
    setForm((prev) => {
      const list = [...prev.acciones];
      list[idxGlobal] = { ...list[idxGlobal], ...data } as Accion;
      return { ...prev, acciones: list };
    });
  }

  function commitDraftIfFilled() {
    const draft = accionDraft;
    const hasKey = !!draft.accionkey && draft.accionkey.trim() !== "";
    const hasDesc = !!draft.acciondescripcion && draft.acciondescripcion.trim() !== "";
    if (hasKey && hasDesc) {
      let newUid = genUid();
      let nextPageIndex = pageIndex;
      setForm((prev) => {
        const newAction = {
          ...draft,
          uid: newUid,
          accioncreadoen: APP_OPTIONS.find((a) => a.value === prev.aplicacionid)?.label ?? prev.objetocreadoen,
        } as Accion;
        const acciones = [...prev.acciones, newAction];
        // Página donde cae la nueva fila (según índice en la lista existente)
        const newIndex = acciones.length - 1;
        nextPageIndex = Math.floor(newIndex / pageSize);
        return { ...prev, acciones };
      });
      // Ajustar página y marcar foco pendiente en Etiqueta
      setPageIndex(nextPageIndex);
      setPendingFocusUid(newUid);
      setAccionDraft({
        uid: "free-row",
        accionid: "",
        accionkey: "",
        acciondescripcion: "",
        accioncreadoen:
          APP_OPTIONS.find((a) => a.value === (initialData?.aplicacionid ?? initialApp.value))?.label ?? initialApp.label,
        accioncodigo: "",
        accionlabel: "",
        accionpath: "",
        accionicon: "",
        accionrelacion: "",
      });
    }
  }

  // Al cambiar la clave, autogenerar el código de la acción (en base a objetokey + accionkey)
  async function handleAccionKeyChange(idxGlobal: number, keyVal: string) {
    if (idxGlobal >= form.acciones.length) {
      setAccionDraft((prev) => ({ ...prev, accionkey: keyVal }));
    } else {
      upsertAccion(idxGlobal, { accionkey: keyVal });
    }
    const trimmed = keyVal.trim();
    const objKey = (form.objetokey || "").trim();
    if (trimmed && objKey) {
      try {
        const code = await generateActionCode(objKey, trimmed);
        if (idxGlobal >= form.acciones.length) {
          setAccionDraft((prev) => ({ ...prev, accioncodigo: code }));
        } else {
          upsertAccion(idxGlobal, { accioncodigo: code });
        }
      } catch (e) {
        console.error("No se pudo generar el código de acción:", e);
      }
    } else {
      if (idxGlobal >= form.acciones.length) {
        setAccionDraft((prev) => ({ ...prev, accioncodigo: "" }));
      } else {
        upsertAccion(idxGlobal, { accioncodigo: "" });
      }
    }
  }

  // Botón para regenerar código manualmente
  async function regenerateAccionCode(idxGlobal: number) {
    const acc = form.acciones[idxGlobal] ?? accionDraft;
    const key = (acc.accionkey || "").trim();
    const objKey = (form.objetokey || "").trim();
    if (!key || !objKey) {
      if (idxGlobal >= form.acciones.length) setAccionDraft((prev) => ({ ...prev, accioncodigo: "" }));
      else upsertAccion(idxGlobal, { accioncodigo: "" });
      return;
    }
    try {
      const code = await generateActionCode(objKey, key);
      if (idxGlobal >= form.acciones.length) setAccionDraft((prev) => ({ ...prev, accioncodigo: code }));
      else upsertAccion(idxGlobal, { accioncodigo: code });
    } catch (e) {
      console.error("No se pudo regenerar el código de acción:", e);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const toastId = toast.loading("Guardando objeto...");
    setSubmitting(true);
    try {
      // Normalizar creadoen con la app elegida
      const creadoEn = APP_OPTIONS.find((a) => a.value === form.aplicacionid)?.label ?? form.objetocreadoen;

      // Fusionar cambios en buffer (rowEdits) a las acciones antes de armar el payload
      const accionesMerged = form.acciones.map((a) => ({ ...a, ...(rowEdits[a.uid] || {}) }));

      // Asegurar códigos de acciones si faltan
      const accionesPayload = await Promise.all(
        accionesMerged.map(async (a) => ({
          AccionId: Number(a.accionid) || 0,
          AccionKey: a.accionkey,
          AccionDescripcion: a.acciondescripcion,
          AccionCreadoEn: creadoEn,
          AccionCodigo:
            a.accioncodigo || (a.accionkey && form.objetokey ? await generateActionCode(form.objetokey, a.accionkey) : ""),
          AccionRelacion: Number(a.accionrelacion) || 0,
          AccionLabel: a.accionlabel || "",
          AccionIcon: a.accionicon || "",
          AccionPath: a.accionpath || "",
        })),
      );

      const payload = {
        ObjetoId: Number(form.objetoid) || 0,
        AplicacionId: Number(form.aplicacionid) || 0,
        ObjetoTipo: form.objetotipo,
        ObjetoKey: form.objetokey,
        ObjetoParentId: 0,
        ObjetoEstado: form.objetoestado,
        ObjetoEsPublico: form.objetoespublico ? "S" : "N",
        ObjetoCreadoEn: creadoEn,
        Acciones: accionesPayload,
      };

      const res = await apiAbmObjetos(payload);
      console.log("ABM Objetos OK", res);
      toast.success("Objeto guardado correctamente", { id: toastId });
    } catch (err) {
      console.error("Error guardando objeto:", err);
      const message = (err as any)?.response?.data?.message || (err as any)?.message || "Ocurrió un error inesperado";
      toast.error("No se pudo guardar el objeto", { id: toastId, description: message });
    } finally {
      setSubmitting(false);
    }
  }

  async function loadRelationItems(page = 1) {
    try {
      setRelationLoading(true);
      const res = await apiListarObjetos({
        AplicacionId: Number(form.aplicacionid) || form.aplicacionid,
        Page: page,
        PageSize: relationPageSize,
        Search: relationSearch?.trim() || "",
      });
      setRelationItems(res.sdtListaObjetos || []);
      setRelationTotal((res as any).total || 0);
      setRelationPage(page);
    } catch (e) {
      console.error("No se pudo listar objetos relacionados", e);
    } finally {
      setRelationLoading(false);
    }
  }

  useEffect(() => {
    if (relationOpen) {
      loadRelationItems(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relationOpen, form.aplicacionid]);

  // Enfocar la columna Etiqueta de la fila recién creada
  useEffect(() => {
    if (pendingFocusUid && etiquetaFocusRef.current) {
      // Usar rAF para asegurar que el nodo esté en el DOM tras el render
      requestAnimationFrame(() => {
        etiquetaFocusRef.current?.focus();
        try { etiquetaFocusRef.current?.select?.(); } catch {}
      });
      // Limpiar bandera
      setPendingFocusUid(null);
    }
  }, [pendingFocusUid, pageIndex, form.acciones.length]);

  return (
    <form onSubmit={handleSubmit} className="container mx-auto max-w-screen-2xl p-4">
      {/* Hidden */}
      <input type="hidden" name="objetoid" value={form.objetoid} />

      <Card>
        <CardHeader>
          <CardTitle>{form.objetoid ? "Editar objeto" : "Crear objeto"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Campos del objeto */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* aplicacionid */}
            <div className="space-y-2 md:col-span-6">
              <Label htmlFor="aplicacionid">Aplicación</Label>
              <Select
                value={form.aplicacionid}
                onValueChange={(v) => {
                  const app = APP_OPTIONS.find((a) => a.value === v) ?? APP_OPTIONS[0];
                  setForm((prev) => ({
                    ...prev,
                    aplicacionid: v,
                    objetocreadoen: app.label,
                    acciones: prev.acciones.map((x) => ({ ...x, accioncreadoen: app.label })),
                  }));
                  setAccionDraft((prev) => ({ ...prev, accioncreadoen: app.label }));
                }}
              >
                <SelectTrigger id="aplicacionid">
                  <SelectValue placeholder="Aplicación">
                    {APP_OPTIONS.find((a) => a.value === form.aplicacionid)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {APP_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.value} - {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* objetotipo */}
            <div className="space-y-2 md:col-span-3">
              <Label htmlFor="objetotipo">Tipo</Label>
              <Select
                value={form.objetotipo}
                onValueChange={(v: TipoCode) => setField("objetotipo", v)}
              >
                <SelectTrigger id="objetotipo">
                  <SelectValue placeholder="Tipo">{form.objetotipo}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(["MENU", "SUBMENU", "PAGE", "FEATURE"] as TipoCode[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* objetoestado */}
            <div className="space-y-2 md:col-span-3">
              <Label htmlFor="objetoestado">Estado</Label>
              <Select
                value={form.objetoestado}
                onValueChange={(v: EstadoCode) => setField("objetoestado", v)}
              >
                <SelectTrigger id="objetoestado">
                  <SelectValue placeholder="Estado">
                    {form.objetoestado === "A" ? "Activo" : "Inactivo"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Activo</SelectItem>
                  <SelectItem value="I">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* objetokey */}
            <div className="space-y-2 md:col-span-9">
              <Label htmlFor="objetokey">Clave</Label>
              <Input
                id="objetokey"
                value={form.objetokey}
                onChange={(e) => setField("objetokey", e.target.value)}
                placeholder="Clave del objeto"
                required
              />
            </div>

            {/* objetoespublico */}
            <div className="space-y-2 md:col-span-3">
              <Label htmlFor="objetoespublico">Es público</Label>
              <div className="flex h-9 items-center">
                <Switch
                  id="objetoespublico"
                  checked={form.objetoespublico}
                  onCheckedChange={(v) => setField("objetoespublico", v)}
                />
              </div>
            </div>
          </div>

          {/* Tabla de acciones */}
          <div className="space-y-2">
            <Label>Acciones</Label>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Clave</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Etiqueta</TableHead>
                    <TableHead>Ruta</TableHead>
                    <TableHead>Icono</TableHead>
                    <TableHead>Relación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    {(() => {
                      const start = pageIndex * pageSize;
                      const end = start + pageSize;
                      const existingPage = form.acciones.slice(start, end);
                      const showFreeRow = end >= form.acciones.length + 1;
                      const pageIds = existingPage.map((a) => a.uid);
                      return (
                        <>
                          <SortableContext items={pageIds} strategy={verticalListSortingStrategy}>
                            {existingPage.map((acc, idx) => {
                              const globalIdx = start + idx;
                              return (
                                <SortableRow key={acc.uid} id={acc.uid}>
                                  <TableCell className="min-w-[180px]">
                                    <Input
                                      value={acc.accionkey}
                                      onChange={(e) => handleAccionKeyChange(globalIdx, e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          commitDraftIfFilled();
                                        }
                                      }}
                                      placeholder="Clave"
                                    />
                                  </TableCell>
                                  <TableCell className="min-w-[220px]">
                                    <Input
                                      value={acc.acciondescripcion}
                                      onChange={(e) => upsertAccion(globalIdx, { acciondescripcion: e.target.value })}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          commitDraftIfFilled();
                                        }
                                      }}
                                      placeholder="Descripción"
                                    />
                                  </TableCell>
                                  {/* Código - 3ra columna */}
                                  <TableCell className="min-w-[240px]">
                                    <div className="relative">
                                      <Input value={acc.accioncodigo} readOnly disabled placeholder="Auto" title="Se autogenera (objeto + clave)" />
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2"
                                        onClick={() => regenerateAccionCode(globalIdx)}
                                        title="Regenerar código"
                                      >
                                        <RefreshCw className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                  <TableCell className="min-w-[200px]">
                                    <Input
                                      ref={acc.uid === pendingFocusUid ? etiquetaFocusRef : undefined}
                                      value={getRowEditValue(acc.uid, "accionlabel", acc.accionlabel)}
                                      onChange={(e) => setRowEdit(acc.uid, { accionlabel: e.target.value })}
                                      onBlur={() => commitRowEdit(acc.uid, "accionlabel", globalIdx)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          commitDraftIfFilled();
                                        }
                                      }}
                                      placeholder="Etiqueta"
                                    />
                                  </TableCell>
                                  <TableCell className="min-w-[200px]">
                                    <Input
                                      value={getRowEditValue(acc.uid, "accionpath", acc.accionpath)}
                                      onChange={(e) => setRowEdit(acc.uid, { accionpath: e.target.value })}
                                      onBlur={() => commitRowEdit(acc.uid, "accionpath", globalIdx)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          commitDraftIfFilled();
                                        }
                                      }}
                                      placeholder="/ruta"
                                    />
                                  </TableCell>
                                  <TableCell className="min-w-[200px]">
                                    <IconPicker
                                        value={(getRowEditValue(acc.uid, "accionicon", acc.accionicon) || "") as IconName}
                                        onChange={(icon) => {
                                        setRowEdit(acc.uid, { accionicon: icon ?? "" });
                                        // podés hacer commitRowEdit acá también si querés guardarlo directo
                                        }}
                                        placeholder="Elegir icono..."
                                        className="w-[180px]"
                                    />
                                    </TableCell>

                                  <TableCell className="min-w-[220px]">
                                    <div className="relative">
                                      <Input
                                        value={relationLabels[acc.uid] ?? acc.accionrelacion}
                                        readOnly
                                        placeholder="Sin relación"
                                        title={acc.accionrelacion ? `ID: ${acc.accionrelacion}` : "Seleccionar relación"}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            commitDraftIfFilled();
                                          }
                                        }}
                                      />
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2"
                                        onClick={() => {
                                          setRelationRow(globalIdx);
                                          setRelationOpen(true);
                                        }}
                                        title="Elegir relación"
                                      >
                                        <Link2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </SortableRow>
                              );
                            })}
                          </SortableContext>

                          {/* Fila libre fuera del SortableContext para evitar remounts al tipear */}
                          {showFreeRow && (
                            <TableRow key={"free-row"}>
                              <TableCell className="w-8"></TableCell>
                              {/* Clave */}
                              <TableCell className="min-w-[180px]">
                                <Input
                                  value={accionDraft.accionkey}
                                  onChange={(e) => handleAccionKeyChange(form.acciones.length, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      commitDraftIfFilled();
                                    }
                                  }}
                                  placeholder="Clave"
                                />
                              </TableCell>
                              {/* Descripción */}
                              <TableCell className="min-w-[220px]">
                                <Input
                                  value={accionDraft.acciondescripcion}
                                  onChange={(e) => upsertAccion(form.acciones.length, { acciondescripcion: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      commitDraftIfFilled();
                                    }
                                  }}
                                  placeholder="Descripción"
                                />
                              </TableCell>
                              {/* Código - 3ra columna */}
                              <TableCell className="min-w-[240px]">
                                <div className="relative">
                                  <Input value={accionDraft.accioncodigo} readOnly disabled placeholder="Auto" title="Se autogenera (objeto + clave)" />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2"
                                    onClick={() => regenerateAccionCode(form.acciones.length)}
                                    title="Regenerar código"
                                  >
                                    <RefreshCw className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                              {/* Celdas opcionales ahora EDITABLES en fila libre */}
                              <TableCell className="min-w-[200px]">
                                <Input
                                  value={accionDraft.accionlabel}
                                  onChange={(e) => setAccionDraft((p) => ({ ...p, accionlabel: e.target.value }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      commitDraftIfFilled();
                                    }
                                  }}
                                  placeholder="Etiqueta"
                                />
                              </TableCell>
                              <TableCell className="min-w-[200px]">
                                <Input
                                  value={accionDraft.accionpath}
                                  onChange={(e) => setAccionDraft((p) => ({ ...p, accionpath: e.target.value }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      commitDraftIfFilled();
                                    }
                                  }}
                                  placeholder="/ruta"
                                />
                              </TableCell>
                              <TableCell className="min-w-[200px]">
                            <IconPicker
                                value={accionDraft.accionicon as IconName}
                                onChange={(icon) => setAccionDraft((prev) => ({ ...prev, accionicon: icon ?? "" }))}
                                placeholder="Elegir icono..."
                                className="w-[180px]"
                            />
                            </TableCell>

                              <TableCell className="min-w-[220px]">
                                <div className="relative">
                                  <Input
                                    value={accionDraft.accionrelacion ? (relationLabels["free-row"] ?? accionDraft.accionrelacion) : ""}
                                    readOnly
                                    placeholder="Sin relación"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        commitDraftIfFilled();
                                      }
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2"
                                    onClick={() => {
                                      setRelationRow(form.acciones.length);
                                      setRelationOpen(true);
                                    }}
                                    title="Elegir relación"
                                  >
                                    <Link2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })()}
                  </DndContext>
               </TableBody>
             </Table>
           </div>

           {/* Modal de relación de acción */}
           <Dialog open={relationOpen} onOpenChange={(open) => {
             setRelationOpen(open);
             if (!open) {
               setRelationSearch("");
               setRelationItems([]);
               setRelationTotal(0);
             }
           }}>
             <DialogContent className="max-w-3xl">
               <DialogHeader>
                 <DialogTitle>Seleccionar objeto relacionado</DialogTitle>
               </DialogHeader>
               <div className="space-y-3">
                 <div className="flex gap-2">
                   <Input
                     placeholder="Buscar por clave..."
                     value={relationSearch}
                     onChange={(e) => setRelationSearch(e.target.value)}
                     onKeyDown={(e) => {
                       if (e.key === "Enter") {
                         e.preventDefault();
                         loadRelationItems(1);
                       }
                     }}
                   />
                   <Button type="button" onClick={() => loadRelationItems(1)} disabled={relationLoading}>
                     Buscar
                   </Button>
                 </div>
                 <div className="border rounded-md overflow-x-auto">
                   <Table>
                     <TableHeader>
                       <TableRow>
                         <TableHead>ObjetoKey</TableHead>
                         <TableHead>ObjetoTipo</TableHead>
                         <TableHead>Estado</TableHead>
                         <TableHead></TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {relationItems.length === 0 ? (
                         <TableRow>
                           <TableCell colSpan={4} className="text-center text-muted-foreground">
                             {relationLoading ? "Cargando..." : "Sin resultados"}
                           </TableCell>
                         </TableRow>
                       ) : (
                         relationItems.map((item) => (
                           <TableRow key={item.ObjetoId}>
                             <TableCell className="font-mono">{item.ObjetoKey}</TableCell>
                             <TableCell>{item.ObjetoTipo}</TableCell>
                             <TableCell>{item.ObjetoEstado}</TableCell>
                             <TableCell className="text-right">
                               <Button
                                 type="button"
                                 size="sm"
                                 onClick={() => {
                                   if (relationRow !== null) {
                                     const uid = form.acciones[relationRow]?.uid;
                                     upsertAccion(relationRow, { accionrelacion: String(item.ObjetoId) });
                                     if (uid) {
                                       setRelationLabels((prev) => ({ ...prev, [uid]: item.ObjetoKey }));
                                     } else {
                                       // Fila libre
                                       setRelationLabels((prev) => ({ ...prev, ["free-row"]: item.ObjetoKey }));
                                     }
                                   }
                                   setRelationOpen(false);
                                 }}
                               >
                                 Seleccionar
                               </Button>
                             </TableCell>
                           </TableRow>
                         ))
                       )}
                     </TableBody>
                   </Table>
                 </div>
                 <div className="flex items-center justify-between pt-2">
                   <span>
                     Página {relationPage} de {Math.max(1, Math.ceil(((relationTotal || 0) || relationItems.length) / relationPageSize))}
                   </span>
                   <div className="flex gap-2">
                     <Button type="button" variant="outline" onClick={() => loadRelationItems(1)} disabled={relationPage === 1 || relationLoading}>
                       «
                     </Button>
                     <Button type="button" variant="outline" onClick={() => loadRelationItems(Math.max(1, relationPage - 1))} disabled={relationPage === 1 || relationLoading}>
                       ‹
                     </Button>
                     <Button type="button" variant="outline" onClick={() => loadRelationItems(relationPage + 1)} disabled={relationLoading}>
                       ›
                     </Button>
                   </div>
                 </div>
                 <div className="flex justify-end gap-2">
                   <Button
                     type="button"
                     variant="outline"
                     onClick={() => {
                       if (relationRow !== null) {
                         const uid = form.acciones[relationRow]?.uid;
                         upsertAccion(relationRow, { accionrelacion: "" });
                         if (uid) setRelationLabels((prev) => {
                           const copy = { ...prev };
                           delete copy[uid];
                           return copy;
                         });
                         else setRelationLabels((prev) => {
                           const copy = { ...prev };
                           delete copy["free-row"];
                           return copy;
                         });
                       }
                       setRelationOpen(false);
                     }}
                   >
                     Limpiar relación
                   </Button>
                   <Button type="button" onClick={() => setRelationOpen(false)}>Cerrar</Button>
                 </div>
               </div>
               <DialogFooter />
             </DialogContent>
           </Dialog>

           {/* Paginación acciones */}
           <div className="flex items-center justify-between pt-2">
             <span>
               Página {pageIndex + 1} de {totalPages}
             </span>
             <div className="flex gap-2">
               <Button type="button" variant="outline" onClick={() => setPageIndex(0)} disabled={pageIndex === 0}>
                 «
               </Button>
               <Button type="button" variant="outline" onClick={() => setPageIndex((p) => Math.max(0, p - 1))} disabled={pageIndex === 0}>
                 ‹
               </Button>
               <Button
                 type="button"
                 variant="outline"
                 onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
                 disabled={pageIndex >= totalPages - 1}
               >
                 ›
               </Button>
               <Button type="button" variant="outline" onClick={() => setPageIndex(totalPages - 1)} disabled={pageIndex >= totalPages - 1}>
                 »
               </Button>
             </div>
           </div>
         </div>
       </CardContent>
       <CardFooter className="justify-end gap-2">
         <Button type="button" variant="outline" onClick={() => history.back()}>
           Cancelar
         </Button>
         <Button type="submit" disabled={submitting}>{submitting ? "Guardando..." : "Confirmar"}</Button>
       </CardFooter>
     </Card>
    </form>
  );
}
