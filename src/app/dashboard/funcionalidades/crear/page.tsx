"use client";

import FuncionalidadForm from "@/components/dashboard/funcionalidades/FuncionalidadForm";

export default function CrearFuncionalidadPage() {
  const handleSubmit = (data: any) => {
    console.log("submit crear funcionalidad", data);
  };
  return (
    <FuncionalidadForm
      mode="create"
      onSave={handleSubmit}
      onCancel={() => history.back()}
    />
  );
}
