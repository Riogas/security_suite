"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import Eventos from "@/components/dashboard/eventos/Eventos";

export default function EventosPage() {
  const router = useRouter();
  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Administración de Eventos</h1>
        <Button onClick={() => router.push("/dashboard/eventos/crear")}>
          Nuevo
          <Plus className="w-4 h-4 ml-2" />
        </Button>
      </div>
      <Eventos />
    </Card>
  );
}
