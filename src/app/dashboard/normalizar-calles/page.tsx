import React from "react";
import ComparadorCalles from "@/components/normalizador-calles/ComparadorCalles";

export default function NormalizadorPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Normalizador de Calles</h1>
      <ComparadorCalles />
    </div>
  );
}
