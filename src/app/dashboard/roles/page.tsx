"use client";

import { BotonRoot } from "@/components/ui/solo-root";
import { Plus, Shield } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import Roles from "@/components/dashboard/roles/Roles";

export default function RolesPage() {
  const router = useRouter();

  return (
    <div className="p-6">
      <PageHeader
        icon={Shield}
        title="Roles"
        description="Definición de roles y sus permisos asociados."
        actions={
          // POST /api/db/roles es nivel ROOT: crear un rol llamado "Root" en
          // la aplicación 1 ES crear el privilegio, porque el rol se
          // identifica por nombre.
          <BotonRoot alcance="ROOT" onClick={() => router.push("/dashboard/roles/crear")}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo rol
          </BotonRoot>
        }
      />
      <Roles />
    </div>
  );
}
