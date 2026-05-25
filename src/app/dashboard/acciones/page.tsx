"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import Eventos from "@/components/dashboard/eventos/Eventos";

export default function EventosPage() {
  const router = useRouter();
  return (
    <div className="p-6">
      <PageHeader
        title="Acciones"
        description="Administración de acciones y eventos del sistema."
        actions={
          <Button onClick={() => router.push("/dashboard/eventos/crear")}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva acción
          </Button>
        }
      />
      <Eventos />
    </div>
  );
}
