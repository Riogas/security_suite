"use client";

import { Button } from "@/components/ui/button";
import { BotonRoot } from "@/components/ui/solo-root";
import { Download, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import Usuarios from "@/components/dashboard/usuarios/Usuarios";

export default function UsuariosPage() {
  const router = useRouter();

  return (
    <div className="p-6">
      <PageHeader
        icon={Users}
        title="Usuarios"
        description="Administración de usuarios del sistema y sus accesos."
        actions={
          <>
            {/*
              El endpoint de importar es de nivel ROOT y devuelve 403 si no.
              Sin el gate, un operador sin permisos llegaba hasta confirmar el
              wizard (tres enumeraciones completas del AS400 de por medio) para
              recién ahí enterarse. `BotonRoot` se apaga solo; quién puede lo
              decide `usePuedeAdministrar()`, un único lugar para las ~20
              escrituras que subieron a ROOT.
            */}
            <BotonRoot
              alcance="usuarios"
              variant="outline"
              onClick={() => router.push("/dashboard/usuarios/importar")}
            >
              <Download className="w-4 h-4 mr-2" />
              Importación masiva
            </BotonRoot>
            {/*
              "Nuevo usuario" NO se gatea: POST /api/db/usuarios es nivel
              AUTENTICADA, no ROOT (el alta ya no puede otorgar root; eso se
              hace asignando el rol Root, que sí está cerrado). Gatearlo sería
              bloquear una operación que el servidor acepta.
            */}
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
