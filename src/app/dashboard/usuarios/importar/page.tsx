"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Download, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import PasoOrigen, { type OpcionesImport } from "@/components/dashboard/usuarios/importar/PasoOrigen";
import PasoComparacion from "@/components/dashboard/usuarios/importar/PasoComparacion";
import ResultadoImport from "@/components/dashboard/usuarios/importar/ResultadoImport";
import type { ImportarUsuariosResult, OrigenExternoUI } from "@/services/api";

const ORIGENES_VALIDOS: readonly OrigenExternoUI[] = ["SGM", "LDAP", "GSIST"];

function esOrigenValido(v: string | null): v is OrigenExternoUI {
  return !!v && (ORIGENES_VALIDOS as readonly string[]).includes(v);
}

const PASOS = [
  { n: 1, label: "Origen y opciones" },
  { n: 2, label: "Comparar y seleccionar" },
  { n: 3, label: "Resultado" },
] as const;

function ImportarUsuariosContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const origenParam = searchParams.get("origen");

  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [opciones, setOpciones] = useState<OpcionesImport>({
    origen: esOrigenValido(origenParam) ? origenParam : "SGM",
    filtro: "",
    incluirDeshabilitados: false,
    conPreferencias: true,
    conRoles: true,
  });
  const [resultado, setResultado] = useState<ImportarUsuariosResult | null>(null);

  return (
    <div className="p-6">
      <PageHeader
        icon={Download}
        title="Importar usuarios"
        description="Traé usuarios desde SGM, LDAP o GSIST comparando primero contra lo que ya está migrado."
      />

      {/* Indicador de paso */}
      <div className="mb-6 flex items-center gap-2">
        {PASOS.map((p, i) => (
          <React.Fragment key={p.n}>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  paso === p.n
                    ? "border-primary bg-primary text-primary-foreground"
                    : paso > p.n
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                )}
              >
                {paso > p.n ? <Check className="size-3.5" /> : p.n}
              </div>
              <span
                className={cn(
                  "text-sm",
                  paso === p.n ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {p.label}
              </span>
            </div>
            {i < PASOS.length - 1 && <div className="mx-2 h-px w-8 bg-border sm:w-16" />}
          </React.Fragment>
        ))}
      </div>

      {paso === 1 && (
        <PasoOrigen opciones={opciones} onChange={setOpciones} onContinuar={() => setPaso(2)} />
      )}

      {paso === 2 && (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setPaso(1)} className="-ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Cambiar origen
          </Button>
          <PasoComparacion
            opciones={opciones}
            onImportado={(r) => {
              setResultado(r);
              setPaso(3);
            }}
          />
        </div>
      )}

      {paso === 3 && resultado && (
        <div className="space-y-4">
          <ResultadoImport result={resultado} />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setResultado(null);
                setPaso(1);
              }}
            >
              Importar más usuarios
            </Button>
            <Button onClick={() => router.push("/dashboard/usuarios")}>
              <Users className="w-4 h-4 mr-2" />
              Volver a Usuarios
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImportarUsuariosPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Cargando…</div>}>
      <ImportarUsuariosContent />
    </Suspense>
  );
}
