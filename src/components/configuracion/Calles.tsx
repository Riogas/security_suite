'use client';
import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ImportCallesModal from "@/components/modals/ImportCallesModal";

const departamentos = ["Montevideo", "Canelones", "Maldonado"];
const localidadesPorDepartamento: Record<string, string[]> = {
  Montevideo: ["Montevideo", "Ciudad Vieja", "Pocitos"],
  Canelones: ["Las Piedras", "La Paz", "Pando"],
  Maldonado: ["Maldonado", "Punta del Este", "San Carlos"],
};

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
        departamentos={departamentos}
        localidadesPorDepartamento={localidadesPorDepartamento}
      />
      <div>Contenido de Calles</div>
    </div>
  );
}
