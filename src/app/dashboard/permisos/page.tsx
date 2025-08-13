"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import Permisos from "@/components/dashboard/permisos/Permisos";

export default function PermisosPage() {
  const router = useRouter();
  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Administración de Permisos</h1>
        <Button onClick={() => router.push('/dashboard/permisos/crear')}>
          Nuevo
          <Plus className="w-4 h-4 ml-2" />
        </Button>
      </div>
      <Permisos />
    </Card>
  );
}
