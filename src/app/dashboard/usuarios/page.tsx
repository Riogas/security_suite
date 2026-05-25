"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import Usuarios from "@/components/dashboard/usuarios/Usuarios";
import SyncUsuariosModal from "@/components/dashboard/usuarios/SyncUsuariosModal";

export default function UsuariosPage() {
  const router = useRouter();
  const [showSync, setShowSync] = useState(false);
  const [syncKey, setSyncKey] = useState(0);

  return (
    <div className="p-6">
      <PageHeader
        title="Usuarios"
        description="Administración de usuarios del sistema y sus accesos."
        actions={
          <>
            <Button variant="outline" onClick={() => setShowSync(true)}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Importación masiva
            </Button>
            <Button onClick={() => router.push("/dashboard/usuarios/crear")}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo usuario
            </Button>
          </>
        }
      />
      <Usuarios key={syncKey} />

      <SyncUsuariosModal
        isOpen={showSync}
        onClose={() => setShowSync(false)}
        onSyncComplete={() => setSyncKey((k) => k + 1)}
      />
    </div>
  );
}
