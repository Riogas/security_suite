"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  apiCrearObjetoDB,
  apiActualizarObjetoDB,
  apiAplicacionesDB,
} from "@/services/api";
import { generarAccionCodigo } from "@/lib/objetoAccionCode";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import IconPicker, { type IconName } from "@/components/dashboard/iconpicker";

export type EstadoCode = "A" | "I";
export type TipoCode = "PAGE" | "FEATURE";

type Accion = { uid: string; key: string; descripcion: string; codigo: string };

export type ObjetoFormState = {
  objetoid: string;
  aplicacionid: string;
  objetotipo: TipoCode;
  objetokey: string;
  objetopath: string;
  objetolabel: string;
  objetoicon: string;
  objetoorden: number;
  objetoestado: EstadoCode;
  objetoespublico: boolean;
  acciones: Accion[];
};

export type ObjetoFormProps = {
  initialData?: Partial<any>;
};

// Plantillas rápidas de acciones de permiso
const PLANTILLAS: { key: string; descripcion: string }[] = [
  { key: "view", descripcion: "Ver" },
  { key: "create", descripcion: "Crear" },
  { key: "edit", descripcion: "Editar" },
  { key: "delete", descripcion: "Eliminar" },
  { key: "export", descripcion: "Exportar" },
];

function genUid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export default function ObjetoForm({ initialData }: ObjetoFormProps) {
  const router = useRouter();
  const [appOptions, setAppOptions] = useState<{ value: string; label: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // map de initialData (acepta el shape del editar: accionkey/acciondescripcion/accioncodigo)
  const mapAcciones = (arr: any[] | undefined): Accion[] =>
    (arr ?? []).map((a) => ({
      uid: a.uid ?? genUid(),
      key: a.key ?? a.accionkey ?? "",
      descripcion: a.descripcion ?? a.acciondescripcion ?? "",
      codigo: a.codigo ?? a.accioncodigo ?? "",
    }));

  const [form, setForm] = useState<ObjetoFormState>({
    objetoid: initialData?.objetoid ?? "",
    aplicacionid: initialData?.aplicacionid ?? "",
    objetotipo: (initialData?.objetotipo === "FEATURE" ? "FEATURE" : "PAGE") as TipoCode,
    objetokey: initialData?.objetokey ?? "",
    objetopath: initialData?.objetopath ?? "",
    objetolabel: initialData?.objetolabel ?? "",
    objetoicon: initialData?.objetoicon ?? "",
    objetoorden: Number(initialData?.objetoorden ?? 0),
    objetoestado: (initialData?.objetoestado ?? "A") as EstadoCode,
    objetoespublico: Boolean(initialData?.objetoespublico ?? false),
    acciones: mapAcciones(initialData?.acciones),
  });

  useEffect(() => {
    apiAplicacionesDB({ estado: "A", pageSize: 999 })
      .then((res) => {
        const opts = (res.items || []).map((a) => ({ value: String(a.id), label: a.nombre }));
        setAppOptions(opts);
        setForm((prev) =>
          prev.aplicacionid ? prev : { ...prev, aplicacionid: opts[0]?.value ?? "" },
        );
      })
      .catch(console.error);
  }, []);

  const setField = <K extends keyof ObjetoFormState>(k: K, v: ObjetoFormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  // Recalcular códigos de todas las acciones cuando cambia la clave del objeto
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!form.objetokey || form.acciones.length === 0) return;
      const updated = await Promise.all(
        form.acciones.map(async (a) =>
          a.key ? { ...a, codigo: await generarAccionCodigo(form.objetokey, a.key) } : a,
        ),
      );
      if (!cancel) setForm((p) => ({ ...p, acciones: updated }));
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.objetokey]);

  const accionKeys = useMemo(
    () => new Set(form.acciones.map((a) => a.key.toLowerCase())),
    [form.acciones],
  );

  const addAccion = async (key: string, descripcion: string) => {
    if (key && accionKeys.has(key.toLowerCase())) {
      toast.info(`La acción "${key}" ya existe`);
      return;
    }
    const codigo = key && form.objetokey ? await generarAccionCodigo(form.objetokey, key) : "";
    setForm((p) => ({
      ...p,
      acciones: [...p.acciones, { uid: genUid(), key, descripcion, codigo }],
    }));
  };

  const updateAccion = async (uid: string, patch: Partial<Accion>) => {
    setForm((p) => ({
      ...p,
      acciones: p.acciones.map((a) => (a.uid === uid ? { ...a, ...patch } : a)),
    }));
    if (patch.key !== undefined && form.objetokey) {
      const codigo = patch.key ? await generarAccionCodigo(form.objetokey, patch.key) : "";
      setForm((p) => ({
        ...p,
        acciones: p.acciones.map((a) => (a.uid === uid ? { ...a, codigo } : a)),
      }));
    }
  };

  const removeAccion = (uid: string) =>
    setForm((p) => ({ ...p, acciones: p.acciones.filter((a) => a.uid !== uid) }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!form.objetokey.trim()) {
      toast.error("La clave es requerida");
      return;
    }
    const toastId = toast.loading("Guardando objeto...");
    setSubmitting(true);
    try {
      const creadoEn = appOptions.find((a) => a.value === form.aplicacionid)?.label ?? "";
      const acciones = form.acciones
        .filter((a) => a.key.trim())
        .map((a) => ({
          key: a.key.trim(),
          descripcion: a.descripcion || null,
          codigo: a.codigo || null,
          creadoEn,
        }));

      const payload = {
        aplicacionId: Number(form.aplicacionid),
        tipo: form.objetotipo,
        key: form.objetokey.trim(),
        label: form.objetolabel || null,
        path: form.objetopath || null,
        icon: form.objetoicon || null,
        orden: form.objetoorden ?? 0,
        estado: form.objetoestado,
        esPublico: form.objetoespublico ? "S" : "N",
        creadoEn,
        acciones,
      };

      const objetoId = Number(form.objetoid);
      if (objetoId > 0) {
        await apiActualizarObjetoDB(objetoId, payload);
      } else {
        await apiCrearObjetoDB(payload);
      }
      toast.success("Objeto guardado correctamente", { id: toastId });
      router.push("/dashboard/objetos");
    } catch (err) {
      console.error("Error guardando objeto:", err);
      toast.error("No se pudo guardar el objeto", {
        id: toastId,
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="container mx-auto max-w-screen-lg p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{form.objetoid ? "Editar objeto" : "Crear objeto"}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Páginas y features del catálogo. La estructura del menú (grupos/submenús) se
            arma en el Constructor de menú.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="space-y-2 md:col-span-6">
              <Label htmlFor="aplicacionid">Aplicación</Label>
              <Select value={form.aplicacionid} onValueChange={(v) => setField("aplicacionid", v)}>
                <SelectTrigger id="aplicacionid">
                  <SelectValue placeholder="Aplicación">
                    {appOptions.find((a) => a.value === form.aplicacionid)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {appOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-3">
              <Label htmlFor="objetotipo">Tipo</Label>
              <Select
                value={form.objetotipo}
                onValueChange={(v: TipoCode) => setField("objetotipo", v)}
              >
                <SelectTrigger id="objetotipo">
                  <SelectValue>{form.objetotipo}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PAGE">PAGE</SelectItem>
                  <SelectItem value="FEATURE">FEATURE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-3">
              <Label htmlFor="objetoestado">Estado</Label>
              <Select
                value={form.objetoestado}
                onValueChange={(v: EstadoCode) => setField("objetoestado", v)}
              >
                <SelectTrigger id="objetoestado">
                  <SelectValue>{form.objetoestado === "A" ? "Activo" : "Inactivo"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Activo</SelectItem>
                  <SelectItem value="I">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-4">
              <Label htmlFor="objetokey">Clave</Label>
              <Input
                id="objetokey"
                value={form.objetokey}
                onChange={(e) => setField("objetokey", e.target.value)}
                placeholder="clientes"
                required
              />
            </div>
            <div className="space-y-2 md:col-span-4">
              <Label htmlFor="objetolabel">Etiqueta</Label>
              <Input
                id="objetolabel"
                value={form.objetolabel}
                onChange={(e) => setField("objetolabel", e.target.value)}
                placeholder="Clientes"
              />
            </div>
            <div className="space-y-2 md:col-span-4">
              <Label htmlFor="objetopath">Ruta</Label>
              <Input
                id="objetopath"
                value={form.objetopath}
                onChange={(e) => setField("objetopath", e.target.value)}
                placeholder="/clientes"
              />
            </div>

            <div className="space-y-2 md:col-span-4">
              <Label>Ícono</Label>
              <IconPicker
                value={(form.objetoicon || "") as IconName}
                onChange={(icon) => setField("objetoicon", icon ?? "")}
                placeholder="Elegir ícono…"
                className="w-full"
              />
            </div>
            <div className="space-y-2 md:col-span-4">
              <Label htmlFor="objetoorden">Orden</Label>
              <Input
                id="objetoorden"
                type="number"
                value={form.objetoorden}
                onChange={(e) => setField("objetoorden", Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2 md:col-span-4">
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
        </CardContent>
      </Card>

      {/* Acciones de permiso */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Acciones de permiso
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Las acciones que las funcionalidades pueden otorgar sobre este objeto. El
            código se genera automáticamente.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PLANTILLAS.map((p) => (
              <Button
                key={p.key}
                type="button"
                variant="outline"
                size="sm"
                disabled={accionKeys.has(p.key)}
                onClick={() => addAccion(p.key, p.descripcion)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                {p.descripcion}
              </Button>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => addAccion("", "")}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Personalizada
            </Button>
          </div>

          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[28%]">Clave</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="w-[180px]">Código</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {form.acciones.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      Sin acciones. Agregá una con los botones de arriba.
                    </TableCell>
                  </TableRow>
                ) : (
                  form.acciones.map((a) => (
                    <TableRow key={a.uid}>
                      <TableCell>
                        <Input
                          value={a.key}
                          onChange={(e) => updateAccion(a.uid, { key: e.target.value })}
                          placeholder="view"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={a.descripcion}
                          onChange={(e) => updateAccion(a.uid, { descripcion: e.target.value })}
                          placeholder="Descripción"
                        />
                      </TableCell>
                      <TableCell>
                        <Input value={a.codigo} readOnly disabled placeholder="Auto" className="font-mono text-xs" />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => removeAccion(a.uid)}
                          aria-label="Eliminar acción"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/dashboard/objetos")}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Guardando..." : "Confirmar"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
