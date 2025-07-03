'use client';
import React, { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { apiGetDepartamentos, apiGetLocalidades } from "@/services/api";
import { Badge } from "@/components/ui/badge";
import MapaZonificacion from "@/components/mapa/MapaZonificacion";
import { apiGetPolygonForLocalidad } from "@/services/api";

interface Departamento {
  id: string;
  name: string;
}

interface Localidad {
  id: string;
  name: string;
  lat: number; // Latitude of the locality
  lon: number; // Longitude of the locality
}

export default function Zonificacion() {
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [selectedDepartamento, setSelectedDepartamento] = useState<string>("");
  const [selectedLocalidades, setSelectedLocalidades] = useState<Localidad[]>([]);
  const [localidadInput, setLocalidadInput] = useState<string>("");
  const [zonas, setZonas] = useState<any[]>([]);

  useEffect(() => {
    const fetchDepartamentos = async () => {
      const data = await apiGetDepartamentos();
      const filteredDepartamentos: Departamento[] = data.sdtDepartamentos.map((dep: any) => ({
        id: dep.DepartamentoId,
        name: dep.DepartamentoNombre,
      }));
      setDepartamentos(filteredDepartamentos);
    };

    fetchDepartamentos();
  }, []);

  useEffect(() => {
    const fetchLocalidades = async () => {
      if (!selectedDepartamento) return;
      const data = await apiGetLocalidades({ DepartamentoId: selectedDepartamento });
      const filteredLocalidades: Localidad[] = data.sdtLocalidad.map((loc: any) => ({
        id: loc.LocalidadId,
        name: loc.LocalidadNombre,
        lat: parseFloat(loc.LocalidadLatitud), // Correctly parse latitude
        lon: parseFloat(loc.LocalidadLongitud), // Correctly parse longitude
      }));
      setLocalidades(filteredLocalidades);
    };

    fetchLocalidades();
  }, [selectedDepartamento]);

  const fetchPolygonForLocalidad = async (localidad: Localidad) => {
    try {
      const polygonData = await apiGetPolygonForLocalidad(localidad.lat, localidad.lon);

      // Validate response structure
      if (!polygonData || !polygonData.elements || !Array.isArray(polygonData.elements)) {
        console.error("Invalid polygon data structure:", polygonData);
        return null;
      }

      // Extract nodes and relations from Overpass response
      const nodes = polygonData.elements.filter((el: any) => el.type === "node");
      const relations = polygonData.elements.filter((el: any) => el.type === "relation");

      // Process relations to extract member nodes
      const polygons = relations.map((relation: any) => {
        const memberNodes = relation.members
          .filter((member: any) => member.type === "node")
          .map((member: any) => {
            const node = nodes.find((n: any) => n.id === member.ref);
            return node ? [node.lat, node.lon] : null;
          })
          .filter((coords: any) => coords !== null);

        return memberNodes.length > 0 ? memberNodes : null; // Ensure valid polygons
      });

      // Return the first valid polygon (if any)
      return polygons.find((polygon: any) => polygon !== null) || []; // Return the first valid polygon or an empty array
    } catch (error) {
      console.error("Error fetching polygon for localidad:", error);
      return null;
    }
  };

  const handleAddLocalidad = async (localidadName: string) => {
    const localidad = localidades.find((loc) => loc.name === localidadName);
    if (localidad && !selectedLocalidades.some((loc) => loc.id === localidad.id)) {
      setSelectedLocalidades([...selectedLocalidades, localidad]);
      setLocalidadInput("");

      const polygon = await fetchPolygonForLocalidad(localidad);
      if (polygon) {
        setZonas((prevZonas) => [...prevZonas, { id: localidad.id, polygon }]);
      }
    }
  };

  const handleRemoveLocalidad = (id: string) => {
    setSelectedLocalidades(selectedLocalidades.filter((loc) => loc.id !== id));
    setZonas((prevZonas) => prevZonas.filter((zona) => zona.id !== id));
  };

  return (
    <div className="flex flex-col gap-4">
      <Select
        value={selectedDepartamento}
        onValueChange={setSelectedDepartamento}
      >
        <SelectTrigger>
          {departamentos.find((dep) => dep.id === selectedDepartamento)?.name ||
            "Seleccione un departamento"}
        </SelectTrigger>
        <SelectContent>
          {departamentos.map((dep) => (
            <SelectItem key={dep.id} value={dep.id}>
              {dep.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative">
        <Input
          value={localidadInput}
          onChange={(e) => setLocalidadInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddLocalidad(localidadInput);
          }}
          placeholder="Escriba una localidad"
          className="flex-grow"
        />
        {localidadInput && (
          <div className="absolute top-full left-0 w-full bg-gray-800 text-white border rounded shadow-md mt-1">
            {localidades
              .filter((loc) => loc.name.toLowerCase().includes(localidadInput.toLowerCase()))
              .map((loc) => (
                <div
                  key={loc.id}
                  className="px-2 py-1 hover:bg-gray-700 cursor-pointer text-sm"
                  onClick={() => handleAddLocalidad(loc.name)}
                >
                  {loc.name}
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-2">
        {selectedLocalidades.map((loc) => (
          <Badge key={loc.id} className="flex items-center gap-2 bg-blue-100 text-blue-800">
            {loc.name}
            <button
              className="text-red-500 hover:text-red-700"
              onClick={() => handleRemoveLocalidad(loc.id)}
            >
              ×
            </button>
          </Badge>
        ))}
      </div>

      <MapaZonificacion zonas={zonas.map((zona) => zona.polygon)} />
    </div>
  );
}
