"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export type EstadoCode = "A" | "I";

export type RolFormState = {
  rolid: string; // identificador oculto
  rolnombre: string; // rol (string)
  roldescripcion: string; // Descripcion (string)
  rolestado: EstadoCode; // Estado (A/I)
  rolnivel: number; // Nivel (numeric)
  rolfchins: string; // Fch Ingreso ISO, oculto
  aplicacionid: string; // 2 o 3
  rolcreadoen: string; // descripción de la app elegida, oculto
};

export type RoleFormProps = {
  initialData?: Partial<RolFormState>;
  onSubmit?: (data: RolFormState) => void | Promise<void>;
};

const APP_OPTIONS = [
  { value: "2", label: "Security Suite" },
  { value: "3", label: "GOYA" },
] as const;

export default function RoleForm({ initialData, onSubmit }: RoleFormProps) {
  const router = useRouter();

  const initialApp = APP_OPTIONS[0];

  const defaults: RolFormState = {
    rolid: "",
    rolnombre: "",
    roldescripcion: "",
    rolestado: "A",
    rolnivel: 0,
    rolfchins: new Date().toISOString(),
    aplicacionid: initialApp.value,
    rolcreadoen: initialApp.label,
  };

  const computeCreatedEn = (aplicacionid?: string, rolcreadoen?: string) =>
    rolcreadoen ?? (APP_OPTIONS.find((a) => a.value === (aplicacionid ?? initialApp.value))?.label ?? initialApp.label);

  const [form, setForm] = useState<RolFormState>(() => ({
    ...defaults,
    ...(initialData ?? {}),
    rolcreadoen: computeCreatedEn(initialData?.aplicacionid, initialData?.rolcreadoen),
  }));

  useEffect(() => {
    if (initialData) {
      setForm({
        ...defaults,
        ...initialData,
        rolcreadoen: computeCreatedEn(initialData.aplicacionid, initialData.rolcreadoen),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialData)]);

  const estadoLabel = useMemo(() => (form.rolestado === "A" ? "Activo" : "Inactivo"), [form.rolestado]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (onSubmit) await onSubmit(form);
      else console.log("Crear/Guardar rol ->", form);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancel = () => router.back();

  const setField = <K extends keyof RolFormState>(key: K, value: RolFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <form onSubmit={handleSubmit} className="container mx-auto max-w-4xl p-4">
      {/* Hidden fields */}
      <input type="hidden" name="rolid" value={form.rolid} />
      <input type="hidden" name="rolfchins" value={form.rolfchins} />
      <input type="hidden" name="rolcreadoen" value={form.rolcreadoen} />

      <Card>
        <CardHeader>
          <CardTitle>{form.rolid ? "Editar rol" : "Crear rol"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* rolnombre */}
            <div className="space-y-2">
              <Label htmlFor="rolnombre">Rol</Label>
              <Input
                id="rolnombre"
                name="rolnombre"
                value={form.rolnombre}
                onChange={(e) => setField("rolnombre", e.target.value)}
                placeholder="Nombre del rol"
                required
              />
            </div>

            {/* roldescripcion */}
            <div className="space-y-2">
              <Label htmlFor="roldescripcion">Descripción</Label>
              <Textarea
                id="roldescripcion"
                name="roldescripcion"
                value={form.roldescripcion}
                onChange={(e) => setField("roldescripcion", e.target.value)}
                placeholder="Descripción del rol"
              />
            </div>

            {/* rolestado */}
            <div className="space-y-2">
              <Label htmlFor="rolestado">Estado</Label>
              <Select
                value={form.rolestado}
                onValueChange={(v: EstadoCode) => setField("rolestado", v)}
              >
                <SelectTrigger id="rolestado">
                  <SelectValue placeholder="Estado">{estadoLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Activo</SelectItem>
                  <SelectItem value="I">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* rolnivel */}
            <div className="space-y-2">
              <Label htmlFor="rolnivel">Nivel</Label>
              <Input
                id="rolnivel"
                name="rolnivel"
                type="number"
                value={form.rolnivel}
                onChange={(e) => setField("rolnivel", Number(e.target.value))}
                min={0}
              />
            </div>

            {/* aplicacionid */}
            <div className="space-y-2">
              <Label htmlFor="aplicacionid">Aplicación</Label>
              <Select
                value={form.aplicacionid}
                onValueChange={(v) => {
                  const app = APP_OPTIONS.find((a) => a.value === v) ?? initialApp;
                  setForm((prev) => ({
                    ...prev,
                    aplicacionid: v,
                    rolcreadoen: app.label,
                  }));
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
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button type="submit">Guardar</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
