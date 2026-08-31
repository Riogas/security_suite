"use client";

import { Settings2 } from "lucide-react";
import { BotonRoot } from "@/components/ui/solo-root";
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
          // POST /api/db/funcionalidades es nivel ROOT: una funcionalidad con
          // `es_publico='S'` hace que el motor conteste GRANTED a todo el mundo
          // para los objetos que tenga colgados.
          <BotonRoot
            alcance="ROOT"
            onClick={() =>
              navigateWithLoading("/dashboard/funcionalidades/crear", {
                loadingText: "Preparando formulario...",
              })
            }
          >
            Nueva funcionalidad
          </BotonRoot>
        }
      />
      <FuncionalidadesTable />
    </div>
  );
}
