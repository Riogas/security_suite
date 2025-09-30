"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import Objetos from "@/components/dashboard/objetos/Objetos";

export default function ObjetosPage() {
  const router = useRouter();
  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Administración de Objetos</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/menu")}
          >
            Administrar Menú
          </Button>
          <Button onClick={() => router.push("/dashboard/objetos/crear")}>
            Nuevo
            <Plus className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
      <Objetos />
    </Card>
  );
}
