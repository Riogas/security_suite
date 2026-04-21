"use client";

import FuncionalidadesTable from "@/components/dashboard/funcionalidades/Funcionalidades";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { usePageTransition } from "@/hooks/usePageTransition";

export default function Page() {
  const router = useRouter();
  const { navigateWithLoading } = usePageTransition();

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Funcionalidades</h1>
        <Button
          onClick={() =>
            navigateWithLoading("/dashboard/funcionalidades/crear", {
              loadingText: "Preparando formulario...",
            })
          }
        >
          Nueva funcionalidad
        </Button>
      </div>
      <FuncionalidadesTable />
    </div>
  );
}
