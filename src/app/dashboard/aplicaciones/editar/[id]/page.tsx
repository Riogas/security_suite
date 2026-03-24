"use client";

import { use } from "react";
import AplicacionForm from "@/components/dashboard/aplicaciones/AplicacionForm";
import { Card } from "@/components/ui/card";

export default function EditarAplicacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <Card className="p-6">
      <h1 className="text-2xl font-bold mb-6">Editar Aplicación</h1>
      <AplicacionForm mode="edit" appId={id} />
    </Card>
  );
}
