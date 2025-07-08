// app/normalizador/page.tsx (o la ruta que uses)
import React from "react";
import ComparadorCalles from "@/components/normalizador-calles/ComparadorCalles";

export default function NormalizadorPage() {
  return (
    <div className="w-full h-full overflow-x-auto">
      <div className="min-w-[1200px] p-6 space-y-6">
        <h1 className="text-2xl font-bold">Normalizador de Calles</h1>
        <ComparadorCalles />
      </div>
    </div>
  );
}
