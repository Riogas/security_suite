"use client";

import { useRouter } from "next/navigation";
import FuncionalidadForm from "@/components/dashboard/funcionalidades/FuncionalidadForm";

export default function CrearFuncionalidadPage() {
  const router = useRouter();
  return (
    <FuncionalidadForm
      mode="create"
      onSave={() => router.push("/dashboard/funcionalidades")}
      onCancel={() => router.push("/dashboard/funcionalidades")}
    />
  );
}
