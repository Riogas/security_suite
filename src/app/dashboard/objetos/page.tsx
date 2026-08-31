"use client";

import { Button } from "@/components/ui/button";
import { BotonRoot } from "@/components/ui/solo-root";
import { Plus, Layers } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import Objetos from "@/components/dashboard/objetos/Objetos";

export default function ObjetosPage() {
  const router = useRouter();
  return (
    <div className="p-6">
      <PageHeader
        icon={Layers}
        title="Objetos"
        description="Administración de objetos y estructura del menú del sistema."
        actions={
          <>
            {/*
              "Administrar Menú" NO se gatea: el builder se puede MIRAR
              (GET /api/db/menu/builder es AUTENTICADA). Lo que está cerrado ahí
              es el "Guardar", y se gatea adentro.
            */}
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard/menu")}
            >
              Administrar Menú
            </Button>
            {/*
              POST /api/db/objetos es nivel ROOT: un objeto con
              `es_publico='S'` da GRANTED a todo el mundo antes de mirar
              funcionalidades, roles o accesos.
            */}
            <BotonRoot onClick={() => router.push("/dashboard/objetos/crear")}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo objeto
            </BotonRoot>
          </>
        }
      />
      <Objetos />
    </div>
  );
}
