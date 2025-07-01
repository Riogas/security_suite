'use client';
import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ImportDepartamentosModal from "@/components/modals/ImportDepartamentosModal";

export default function Departamentos() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Input placeholder="Buscar departamentos..." className="w-1/2" />
        <Button className="ml-4" onClick={() => setIsModalOpen(true)}>
          Importar
        </Button>
      </div>
      <ImportDepartamentosModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      <div>Contenido de Departamentos</div>
    </div>
  );
}
