"use client";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Download, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import Usuarios from "@/components/dashboard/usuarios/Usuarios";
import { useEsRoot } from "@/hooks/useEsRoot";

export default function UsuariosPage() {
  const router = useRouter();
  // El endpoint de importar es de nivel ROOT y devuelve 403 si no. Sin esto,
  // un operador sin permisos llegaba hasta confirmar el wizard (tres
  // enumeraciones completas del AS400 de por medio) para recién ahí enterarse.
  //
  // Se le pregunta a secapi (`GET /api/db/usuarios/yo`) y no a
  // `localStorage.user.isRoot`: ese valor lo pone el login de GeneXus y en
  // producción está invertido respecto de esta base, así que el botón decidía
  // distinto que el endpoint. Mientras carga: no root (fail-closed en la UI,
  // igual que antes).
  const { esRoot } = useEsRoot();

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
