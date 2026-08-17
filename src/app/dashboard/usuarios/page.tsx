"use client";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Download, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import Usuarios from "@/components/dashboard/usuarios/Usuarios";
import { useUser } from "@/hooks/useUser";

export default function UsuariosPage() {
  const router = useRouter();
  const { user } = useUser();
  // El endpoint de importar exige esRoot='S' y devuelve 403 si no. Sin esto,
  // un operador sin permisos llegaba hasta confirmar el wizard (tres
  // enumeraciones completas del AS400 de por medio) para recién ahí
  // enterarse. `user` es null hasta que useUser() lee localStorage: por
  // defecto se trata como no-root (fail-closed en la UI).
  const esRoot = user?.isRoot === "S";

  return (
    <div className="p-6">
      <PageHeader
        icon={Users}
        title="Usuarios"
        description="Administración de usuarios del sistema y sus accesos."
        actions={
          <>
            {esRoot ? (
              <Button variant="outline" onClick={() => router.push("/dashboard/usuarios/importar")}>
                <Download className="w-4 h-4 mr-2" />
                Importación masiva
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="outline" disabled>
                      <Download className="w-4 h-4 mr-2" />
                      Importación masiva
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Requiere permisos de root</TooltipContent>
              </Tooltip>
            )}
            <Button onClick={() => router.push("/dashboard/usuarios/crear")}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo usuario
            </Button>
          </>
        }
      />
      <Usuarios />
    </div>
  );
}
