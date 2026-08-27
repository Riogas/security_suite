"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { ImportarUsuariosResult } from "@/services/api";

export default function ResultadoImport({ result }: { result: ImportarUsuariosResult }) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2">
        {result.errores === 0 ? (
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-yellow-500" />
        )}
        <span className="font-medium text-sm">{result.mensaje}</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center rounded-md bg-muted p-3">
          <span className="text-2xl font-bold text-green-600">{result.creados}</span>
          <span className="text-xs text-muted-foreground mt-1">Creados</span>
        </div>
        <div className="flex flex-col items-center rounded-md bg-muted p-3">
          <span className="text-2xl font-bold text-blue-600">{result.omitidos}</span>
          <span className="text-xs text-muted-foreground mt-1">Omitidos</span>
        </div>
        <div className="flex flex-col items-center rounded-md bg-muted p-3">
          <span className="text-2xl font-bold text-red-600">{result.errores}</span>
          <span className="text-xs text-muted-foreground mt-1">Errores</span>
        </div>
      </div>

      {result.detalles?.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Detalle
          </p>
          <div className="max-h-60 overflow-y-auto space-y-1 rounded border p-2 bg-muted/40">
            {result.detalles.map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <XCircle
                  className={`w-3 h-3 mt-0.5 shrink-0 ${d.estado === "error" ? "text-red-500" : "text-blue-500"}`}
                />
                <span>
                  <span className="font-mono font-medium">{d.username}</span>
                  {" — "}
                  <span className="text-muted-foreground break-all">{d.motivo || d.estado}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
