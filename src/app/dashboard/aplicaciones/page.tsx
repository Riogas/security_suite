"use client";

import { Button } from "@/components/ui/button";
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
          <Button onClick={() => router.push("/dashboard/aplicaciones/crear")}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva aplicación
          </Button>
        }
      />
      <Aplicaciones />
    </div>
  );
}
