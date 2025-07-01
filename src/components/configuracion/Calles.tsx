'use client';
import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ImportCallesModal from "@/components/modals/ImportCallesModal";

const localidades = ["Centro", "Ciudad Vieja", "Pocitos"];

export default function Calles() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Input placeholder="Buscar calles..." className="w-1/2 bg-gray-700 text-white" />
        <Button onClick={() => setIsModalOpen(true)}>
          Importar
        </Button>
      </div>
      <ImportCallesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        localidades={localidades}
      />
      <div>Contenido de Calles</div>
    </div>
  );
}
