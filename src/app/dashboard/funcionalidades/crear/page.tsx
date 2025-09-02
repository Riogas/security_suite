"use client";

import FuncionalidadForm, { FuncionalidadData } from "@/components/dashboard/funcionalidades/FuncionalidadForm";

export default function CrearFuncionalidadPage() {
  const handleSubmit = (data: FuncionalidadData) => {
    console.log("submit crear funcionalidad", data);
  };
  return (
    <FuncionalidadForm mode="create" onSubmit={handleSubmit} onCancel={() => history.back()} />
  );
}
