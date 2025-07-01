import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { toast } from "sonner";

interface ImportCallesModalProps {
  isOpen: boolean;
  onClose: () => void;
  departamentos: string[];
  localidadesPorDepartamento: Record<string, string[]>;
}

export default function ImportCallesModal({ isOpen, onClose, departamentos, localidadesPorDepartamento }: ImportCallesModalProps) {
  const [departamento, setDepartamento] = useState("");
  const [localidad, setLocalidad] = useState("");
  const [loading, setLoading] = useState(false);

  const importar = async () => {
    const pais = "Uruguay";
    if (!pais || !departamento || !localidad) {
      toast.error("Por favor, seleccione un departamento y una localidad.");
      return;
    }
    setLoading(true);
    try {
      toast("Obteniendo calles desde Overpass...");
      const overpassQuery = `
        [out:json];
        area["name"="Uruguay"]["admin_level"="2"]->.country;
        area["name"="${departamento}"]["admin_level"="4"](area.country)->.depArea;
        area["name"="${localidad}"]["admin_level"="8"](area.depArea)->.searchArea;
        (
          way["highway"]["name"](area.searchArea);
        );
        out tags;
      `;
      const overpassResponse = await fetch(
        "https://overpass-api.de/api/interpreter",
        {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: overpassQuery,
        },
      );
      if (!overpassResponse.ok) {
        throw new Error(`Error en Overpass API: ${overpassResponse.status}`);
      }
      const overpassData = await overpassResponse.json();
      const uniqueStreets = Array.from(
        new Map(
          overpassData.elements.map((way: any) => [
            way.tags.name,
            { name: way.tags.name, old_name: way.tags.old_name || "N/A" },
          ]),
        ).values(),
      );
      toast.success("Calles importadas correctamente.");
      onClose();
    } catch (error: any) {
      console.error("Error importando calles:", error.message);
      toast.error("Error al importar calles. Consulte la consola para más detalles.");
    } finally {
      setLoading(false);
    }
  };

  const localidades = departamento ? localidadesPorDepartamento[departamento] || [] : [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar Calles</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Select value={departamento} onValueChange={value => { setDepartamento(value); setLocalidad(""); }}>
            <SelectTrigger>Seleccione un departamento</SelectTrigger>
            <SelectContent>
              {departamentos.map((dep) => (
                <SelectItem key={dep} value={dep}>{dep}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={localidad} onValueChange={setLocalidad} disabled={!departamento}>
            <SelectTrigger>{departamento ? "Seleccione una localidad" : "Seleccione un departamento primero"}</SelectTrigger>
            <SelectContent>
              {localidades.map((loc) => (
                <SelectItem key={loc} value={loc}>{loc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={importar} disabled={loading || !departamento || !localidad}>
            {loading ? "Importando..." : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
