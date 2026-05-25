"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import Roles from "@/components/dashboard/roles/Roles";

export default function RolesPage() {
  const router = useRouter();

  return (
    <div className="p-6">
      <PageHeader
        title="Roles"
        description="Definición de roles y sus permisos asociados."
        actions={
          <Button onClick={() => router.push("/dashboard/roles/crear")}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo rol
          </Button>
        }
      />
      <Roles />
    </div>
  );
}
