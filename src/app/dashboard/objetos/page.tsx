"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import Objetos from "@/components/dashboard/objetos/Objetos";

export default function ObjetosPage() {
  const router = useRouter();
  return (
    <div className="p-6">
      <PageHeader
        title="Objetos"
        description="Administración de objetos y estructura del menú del sistema."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard/menu")}
            >
              Administrar Menú
            </Button>
            <Button onClick={() => router.push("/dashboard/objetos/crear")}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo objeto
            </Button>
          </>
        }
      />
      <Objetos />
    </div>
  );
}
