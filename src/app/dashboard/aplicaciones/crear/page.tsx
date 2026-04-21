"use client";

import AplicacionForm from "@/components/dashboard/aplicaciones/AplicacionForm";
import { Card } from "@/components/ui/card";

export default function CrearAplicacionPage() {
  return (
    <Card className="p-6">
      <h1 className="text-2xl font-bold mb-6">Crear Aplicación</h1>
      <AplicacionForm mode="create" />
    </Card>
  );
}
