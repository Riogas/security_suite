'use client';
import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ImportLocalidadesModal from "@/components/modals/ImportLocalidadesModal";

const departamentos = ["Montevideo", "Canelones", "Maldonado"];

export default function Localidades() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="bg-gray-800 text-white p-4 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <Input placeholder="Buscar localidades..." className="w-1/2 bg-gray-700 text-white" />
        <Button className="ml-4 bg-blue-500 text-white" onClick={() => setIsModalOpen(true)}>
          Importar
        </Button>
      </div>
      <ImportLocalidadesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        departamentos={departamentos}
      />
      <div>Contenido de Localidades</div>
    </div>
  );
}
