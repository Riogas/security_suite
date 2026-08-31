"use client";

import { BotonRoot } from "@/components/ui/solo-root";
import { Plus, Lock } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import Permisos from "@/components/dashboard/permisos/Permisos";

export default function PermisosPage() {
  const router = useRouter();
  return (
    <div className="p-6">
      <PageHeader
        icon={Lock}
        title="Permisos"
        description="Control de permisos y accesos por rol y usuario."
        actions={
          // POST /api/db/accesos es nivel ROOT: es la concesión directa de una
          // funcionalidad a un usuario, la otra mitad del motor de permisos.
          <BotonRoot alcance="ROOT" onClick={() => router.push("/dashboard/permisos/crear")}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo permiso
          </BotonRoot>
        }
      />
      <Permisos />
    </div>
  );
}
