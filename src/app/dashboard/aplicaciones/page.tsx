"use client";

import { BotonRoot } from "@/components/ui/solo-root";
import { Plus, LayoutGrid } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import Aplicaciones from "@/components/dashboard/aplicaciones/aplicaciones";

export default function AplicacionesPage() {
  const router = useRouter();

  return (
    <div className="p-6">
      <PageHeader
        icon={LayoutGrid}
        title="Aplicaciones"
        description="Administración de aplicaciones integradas al sistema."
        actions={
          // POST /api/db/aplicaciones es nivel ROOT: una aplicación es el
          // contenedor de roles, funcionalidades y objetos.
          <BotonRoot alcance="ROOT" onClick={() => router.push("/dashboard/aplicaciones/crear")}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva aplicación
          </BotonRoot>
        }
      />
      <Aplicaciones />
    </div>
  );
}
