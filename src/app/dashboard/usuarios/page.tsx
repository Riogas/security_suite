"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import Usuarios from "@/components/dashboard/usuarios/Usuarios";
import SyncUsuariosModal from "@/components/dashboard/usuarios/SyncUsuariosModal";

export default function UsuariosPage() {
  const router = useRouter();
  const [showSync, setShowSync] = useState(false);
  const [syncKey, setSyncKey] = useState(0);

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Administración de Usuarios</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowSync(true)}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Importación masiva
          </Button>
          <Button onClick={() => router.push("/dashboard/usuarios/crear")}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo usuario
          </Button>
        </div>
      </div>
      <Usuarios key={syncKey} />

      <SyncUsuariosModal
        isOpen={showSync}
        onClose={() => setShowSync(false)}
        onSyncComplete={() => setSyncKey((k) => k + 1)}
      />
    </Card>
  );
}
