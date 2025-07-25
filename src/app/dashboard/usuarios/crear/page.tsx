"use client";

import UsuarioForm from "@/components/dashboard/usuarios/UsuarioForm";
import { Card } from "@/components/ui/card";

export default function CrearUsuarioPage() {
  return (
    <Card className="p-6">
      <h1 className="text-2xl font-bold mb-6">Crear Usuario</h1>
      <UsuarioForm mode="create" />
    </Card>
  );
}
