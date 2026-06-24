"use client";

import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageTransition } from "@/hooks/usePageTransition";

import { PageHeader } from "@/components/ui/page-header";
import FuncionalidadesTable from "@/components/dashboard/funcionalidades/Funcionalidades";

export default function Page() {
  const { navigateWithLoading } = usePageTransition();

  return (
    <div className="p-6">
      <PageHeader
        icon={Settings2}
        title="Funcionalidades"
        description="Gestión de funcionalidades disponibles en el sistema."
        actions={
          <Button
            onClick={() =>
              navigateWithLoading("/dashboard/funcionalidades/crear", {
                loadingText: "Preparando formulario...",
              })
            }
          >
            Nueva funcionalidad
          </Button>
        }
      />
      <FuncionalidadesTable />
    </div>
  );
}
