"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Network, Server, Smartphone } from "lucide-react";
import { apiUsuariosExternos, type OrigenExternoUI } from "@/services/api";

export interface OpcionesImport {
  origen: OrigenExternoUI;
  filtro: string;
  incluirDeshabilitados: boolean;
  conPreferencias: boolean;
  conRoles: boolean;
}

const CARDS: { key: OrigenExternoUI; label: string; detalle: string; Icon: typeof Smartphone }[] = [
  { key: "SGM", label: "SGM", detalle: "Usuarios móviles (GXICAGEO.USUMOBILE)", Icon: Smartphone },
  { key: "LDAP", label: "LDAP", detalle: "Validan contra Active Directory", Icon: Network },
  { key: "GSIST", label: "ADMSEC / GSIST", detalle: "Clave propia en ADMSEC", Icon: Server },
];

/**
 * Traduce el `reason` técnico de la fuente a algo que el operador entienda.
 *
 * El `reason` NO llega como un token pelado: `sources/index.ts::validarRespuesta`
 * arma el mensaje del Error como `[origen, reason, error?].join(": ")`, así que
 * lo que de verdad llega acá es algo como "SGM: SIN_AS400_API_URL" o
 * "GSIST: UNAVAILABLE: fetch failed". Por eso el match es por substring, no
 * por igualdad exacta.
 */
function motivoLegible(reason: string | null): string {
  if (!reason) return "No disponible";
  // Inalcanzable hoy — la fuente LDAP cae a ADMSEC antes de que este motivo
  // llegue a superficie — pero documenta la intención: se activa el día que
  // haya cuenta de servicio de AD y esa cuenta falte.
  if (reason.includes("NO_SERVICE_ACCOUNT")) return "Requiere cuenta de servicio de Active Directory";
  if (reason.includes("SIN_USERS_API_KEY")) return "Falta configurar USERS_API_KEY";
  if (reason.includes("SIN_AS400_API_URL")) return "Falta configurar AS400_API_URL";
  // Distinto de "mal configurado": acá la config está, pero la fuente no
  // contestó (timeout, red caída, servicio abajo). Le cambia al operador qué
  // hacer — no es un ticket a sistemas, es reintentar en un rato.
  if (reason.includes("UNAVAILABLE")) return "No responde";
  return "No disponible";
}

export default function PasoOrigen({
  opciones,
  onChange,
  onContinuar,
}: {
  opciones: OpcionesImport;
  onChange: (o: OpcionesImport) => void;
  onContinuar: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [estadoFuentes, setEstadoFuentes] = useState<
    Record<string, { ok: boolean; reason: string | null; nuevos: number }>
  >({});

  // Al montar, una consulta por origen para saber disponibilidad y cuántos faltan.
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setCargando(true);
        const res = await Promise.all(
          CARDS.map((c) =>
            apiUsuariosExternos({
              origen: c.key,
              estadoComparacion: "NUEVO",
              pageSize: 1,
              signal: ac.signal,
            })
              .then((r) => ({
                key: c.key,
                ok: r.fuentes[0]?.ok ?? true,
                reason: r.fuentes[0]?.reason ?? null,
                nuevos: r.total,
              }))
              .catch(() => ({ key: c.key, ok: false, reason: null, nuevos: 0 })),
          ),
        );
        setEstadoFuentes(
          Object.fromEntries(res.map((r) => [r.key, { ok: r.ok, reason: r.reason, nuevos: r.nuevos }])),
        );
      } finally {
        setCargando(false);
      }
    })();
    return () => ac.abort();
  }, []);

  const esSgm = opciones.origen === "SGM";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {CARDS.map(({ key, label, detalle, Icon }) => {
          const estado = estadoFuentes[key];
          const deshabilitada = estado ? !estado.ok : false;
          const elegida = opciones.origen === key;
          return (
            <button
              key={key}
              type="button"
              disabled={deshabilitada}
              onClick={() => onChange({ ...opciones, origen: key })}
              className={`rounded-lg border p-4 text-left transition ${
                elegida ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"
              } ${deshabilitada ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-5 h-5" />
                <span className="font-medium">{label}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{detalle}</p>
              <div className="mt-3 text-sm">
                {cargando ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : deshabilitada ? (
                  <span className="text-amber-500 text-xs">{motivoLegible(estado?.reason ?? null)}</span>
                ) : (
                  <span>
                    <span className="text-2xl font-bold">{estado?.nuevos ?? 0}</span>
                    <span className="text-muted-foreground text-xs ml-1">sin importar</span>
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="filtro-origen">Filtrar</Label>
          <Input
            id="filtro-origen"
            placeholder="Usuario, nombre o email"
            value={opciones.filtro}
            onChange={(e) => onChange({ ...opciones, filtro: e.target.value })}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Incluir deshabilitados</p>
            <p className="text-xs text-muted-foreground">Usuarios dados de baja en el sistema origen</p>
          </div>
          <Switch
            checked={opciones.incluirDeshabilitados}
            onCheckedChange={(v) => onChange({ ...opciones, incluirDeshabilitados: v })}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Traer preferencias</p>
            <p className="text-xs text-muted-foreground">
              {esSgm
                ? "Escenario y Empresa Fletera desde la agencia del usuario"
                : "Solo aplica a usuarios de SGM"}
            </p>
          </div>
          <Switch
            disabled={!esSgm}
            checked={esSgm && opciones.conPreferencias}
            onCheckedChange={(v) => onChange({ ...opciones, conPreferencias: v })}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Asignar roles</p>
            <p className="text-xs text-muted-foreground">
              Según los grupos que el usuario tenga en el sistema origen
            </p>
          </div>
          <Switch
            checked={opciones.conRoles}
            onCheckedChange={(v) => onChange({ ...opciones, conRoles: v })}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={onContinuar} disabled={cargando || estadoFuentes[opciones.origen]?.ok === false}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
