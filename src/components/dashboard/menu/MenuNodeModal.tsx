"use client";

import React, { useEffect, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, X, FolderTree, Folder, FileText } from "lucide-react";
import IconPicker, { type IconName } from "@/components/dashboard/iconpicker";
import type { MenuNodeKind, MenuBuilderRecurso } from "@/services/api";

export interface NodeDraft {
  nodeKind: MenuNodeKind;
  key: string;
  label: string;
  path: string;
  icon: string;
  estado: "A" | "I";
  targetObjetoId?: number | null;
}

interface MenuNodeModalProps {
  open: boolean;
  initial: NodeDraft | null;
  recursos: MenuBuilderRecurso[];
  onClose: () => void;
  onSave: (draft: NodeDraft) => void;
}

const KIND_META: Record<MenuNodeKind, { label: string; icon: typeof Folder }> = {
  GROUP: { label: "Grupo", icon: FolderTree },
  SUBMENU: { label: "Submenú", icon: Folder },
  LINK: { label: "Página / enlace", icon: FileText },
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "");
}

export default function MenuNodeModal({
  open,
  initial,
  recursos,
  onClose,
  onSave,
}: MenuNodeModalProps) {
  const [draft, setDraft] = useState<NodeDraft | null>(initial);
  const [keyTouched, setKeyTouched] = useState(false);

  useEffect(() => {
    setDraft(initial);
    setKeyTouched(Boolean(initial?.key));
  }, [initial]);

  if (!draft) return null;

  const set = (patch: Partial<NodeDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const Meta = KIND_META[draft.nodeKind];
  const isLink = draft.nodeKind === "LINK";

  const onLabelChange = (label: string) => {
    set({ label, ...(keyTouched ? {} : { key: slugify(label) }) });
  };

  const onRecursoChange = (v: string) => {
    const r = recursos.find((x) => String(x.id) === v);
    if (!r) {
      set({ targetObjetoId: null });
      return;
    }
    set({
      targetObjetoId: r.id,
      label: draft.label || r.label || r.key,
      key: keyTouched ? draft.key : slugify(r.label || r.key),
      path: draft.path || `/dashboard/${r.key}`,
    });
  };

  const handleSave = () => {
    if (!draft.label.trim()) return;
    onSave({ ...draft, key: draft.key.trim() || slugify(draft.label) });
  };

  return (
    <ModalShell
      open={open}
      onOpenChange={onClose}
      title={`${draft.key ? "Editar" : "Nuevo"} ${Meta.label}`}
      description="Definí cómo se ve y a dónde apunta este punto del menú."
      icon={Meta.icon}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" aria-hidden="true" />
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!draft.label.trim()}>
            <Save className="w-4 h-4 mr-2" aria-hidden="true" />
            Aplicar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="node-label">Etiqueta</Label>
          <Input
            id="node-label"
            value={draft.label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="Ej: Clientes"
            autoFocus
          />
        </div>

        {isLink && (
          <div className="space-y-1.5">
            <Label>Recurso (página / feature)</Label>
            <Select
              value={draft.targetObjetoId ? String(draft.targetObjetoId) : "none"}
              onValueChange={onRecursoChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin recurso (link suelto)" />
              </SelectTrigger>
              <SelectContent className="max-h-[40vh]">
                <SelectItem value="none">Sin recurso (link suelto)</SelectItem>
                {recursos.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.label || r.key} · {r.tipo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Si el recurso aún no existe, creálo en Objetos y luego enlazalo acá.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="node-key">Clave</Label>
            <Input
              id="node-key"
              value={draft.key}
              onChange={(e) => {
                setKeyTouched(true);
                set({ key: e.target.value });
              }}
              placeholder="clave"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ícono</Label>
            <IconPicker
              value={(draft.icon || "") as IconName}
              onChange={(icon) => set({ icon: icon ?? "" })}
              placeholder="Elegir ícono…"
              className="w-full"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="node-path">Ruta de navegación</Label>
          <Input
            id="node-path"
            value={draft.path}
            onChange={(e) => set({ path: e.target.value })}
            placeholder="/dashboard/clientes"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Switch
            id="node-estado"
            checked={draft.estado === "A"}
            onCheckedChange={(v) => set({ estado: v ? "A" : "I" })}
          />
          <Label htmlFor="node-estado">Activo</Label>
        </div>
      </div>
    </ModalShell>
  );
}
