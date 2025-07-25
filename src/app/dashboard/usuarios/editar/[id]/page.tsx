"use client";

import { useParams } from "next/navigation";
import UsuarioForm from "@/components/dashboard/usuarios/UsuarioForm";
import { Card } from "@/components/ui/card";

export default function EditarUsuarioPage() {
  const params = useParams();
  const userId = params.id as string;

  return (
    <Card className="p-6">
      <h1 className="text-2xl font-bold mb-6">Editar Usuario</h1>
      <UsuarioForm mode="edit" userId={userId} />
    </Card>
  );
}
