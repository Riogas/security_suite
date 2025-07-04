"use client";
import React, { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  apiGetDepartamentos,
  apiGetLocalidades,
  apiGetPolygonForLocalidad,
} from "@/services/api";
import { Badge } from "@/components/ui/badge";
import MapaZonificacion from "@/components/mapa/MapaZonificacion";
import { Button } from "@/components/ui/button";
import booleanContains from "@turf/boolean-contains";
import { polygon as turfPolygon } from "@turf/helpers";

interface Departamento {
  id: string;
  name: string;
}

interface Localidad {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

interface LocalidadZona {
  id: string;
  name: string;
  coordinates: [number, number][][];
}

// 🔄 Función para ordenar los ways
function connectWaysInOrder(ways: number[][]): number[] {
  if (ways.length === 0) return [];

  const result: number[] = [...ways[0]];
  const used = new Set<number>();
  used.add(0);

  while (used.size < ways.length) {
    const lastNode = result[result.length - 1];
    let matched = false;

    for (let i = 1; i < ways.length; i++) {
      if (used.has(i)) continue;

      const way = ways[i];
      if (way[0] === lastNode) {
        result.push(...way.slice(1));
        used.add(i);
        matched = true;
        break;
      } else if (way[way.length - 1] === lastNode) {
        result.push(...way.slice(0, -1).reverse());
        used.add(i);
        matched = true;
        break;
      }
    }

    if (!matched) break;
  }

  return result;
}

// 🧠 Eliminar zonas contenidas dentro de otras más grandes
function filtrarZonasSuperpuestas(zonas: LocalidadZona[]): LocalidadZona[] {
  const zonasFiltradas: LocalidadZona[] = [];

  for (let i = 0; i < zonas.length; i++) {
    const zonaA = zonas[i];
    const polyA = turfPolygon(zonaA.coordinates);

    let estaContenida = false;

    for (let j = 0; j < zonas.length; j++) {
      if (i === j) continue;

      const zonaB = zonas[j];
      const polyB = turfPolygon(zonaB.coordinates);

      if (booleanContains(polyB, polyA)) {
        estaContenida = true;
        break;
      }
    }

    if (!estaContenida) {
      zonasFiltradas.push(zonaA);
    }
  }

  return zonasFiltradas;
}

// 📦 COMPONENTE PRINCIPAL
export default function Zonificacion() {
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [selectedDepartamento, setSelectedDepartamento] = useState<string>("");
  const [selectedLocalidades, setSelectedLocalidades] = useState<Localidad[]>(
    [],
  );
  const [localidadInput, setLocalidadInput] = useState<string>("");
  const [zonas, setZonas] = useState<LocalidadZona[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  useEffect(() => {
    const fetchDepartamentos = async () => {
      const data = await apiGetDepartamentos();
      const filtered: Departamento[] = data.sdtDepartamentos.map(
        (dep: any) => ({
          id: dep.DepartamentoId,
          name: dep.DepartamentoNombre,
        }),
      );
      setDepartamentos(filtered);
    };
    fetchDepartamentos();
  }, []);

  useEffect(() => {
    const fetchLocalidades = async () => {
      if (!selectedDepartamento) return;
      const data = await apiGetLocalidades({
        DepartamentoId: selectedDepartamento,
      });
      const filtered: Localidad[] = data.sdtLocalidad
        .filter((loc: any) => loc.LocalidadEstado === "S") // ✅ Filtrar por estado
        .map((loc: any) => ({
          id: loc.LocalidadId,
          name: loc.LocalidadNombre,
          lat: parseFloat(loc.LocalidadLatitud),
          lon: parseFloat(loc.LocalidadLongitud),
        }));
      setLocalidades(filtered);
    };
    fetchLocalidades();
  }, [selectedDepartamento]);

  const fetchPolygonForLocalidad = async (localidad: Localidad) => {
    try {
      const polygonData = await apiGetPolygonForLocalidad(
        localidad.lat,
        localidad.lon,
      );
      const nodesById = new Map<number, [number, number]>();
      const waysById = new Map<number, number[]>();

      for (const el of polygonData.elements) {
        if (el.type === "node") nodesById.set(el.id, [el.lat, el.lon]);
        else if (el.type === "way") waysById.set(el.id, el.nodes);
      }

      const relations = polygonData.elements.filter(
        (el: any) => el.type === "relation",
      );
      const polygons: [number, number][][] = [];

      for (const rel of relations) {
        const outerWays = rel.members
          .filter((m: any) => m.role === "outer" && m.type === "way")
          .map((m: any) => waysById.get(m.ref))
          .filter((nodes: any): nodes is number[] => !!nodes);

        const orderedNodeIds = connectWaysInOrder(outerWays);
        const polygonCoords: [number, number][] = orderedNodeIds
          .map((nodeId) => nodesById.get(nodeId))
          .filter((coords): coords is [number, number] => coords !== undefined);

        if (
          polygonCoords.length > 0 &&
          (polygonCoords[0][0] !== polygonCoords[polygonCoords.length - 1][0] ||
            polygonCoords[0][1] !== polygonCoords[polygonCoords.length - 1][1])
        ) {
          polygonCoords.push(polygonCoords[0]);
        }

        if (polygonCoords.length > 0) polygons.push(polygonCoords);
      }

      return polygons.length > 0 ? polygons : null;
    } catch (error) {
      console.error("Error fetching polygon for localidad:", error);
      return null;
    }
  };

  const handleAddLocalidad = async (localidadName: string) => {
    const localidad = localidades.find((loc) => loc.name === localidadName);
    if (
      localidad &&
      !selectedLocalidades.some((loc) => loc.id === localidad.id)
    ) {
      setSelectedLocalidades((prev) => [...prev, localidad]);
      setLocalidadInput("");

      const polygon = await fetchPolygonForLocalidad(localidad);
      if (polygon) {
        const nuevasZonas = [
          ...zonas,
          { id: localidad.id, name: localidad.name, coordinates: polygon },
        ];
        setZonas(filtrarZonasSuperpuestas(nuevasZonas));
      }
    }
  };

  const handleRemoveLocalidad = (id: string) => {
    const nuevasLocalidades = selectedLocalidades.filter(
      (loc) => loc.id !== id,
    );
    const nuevasZonas = zonas.filter((zona) => zona.id !== id);
    setSelectedLocalidades(nuevasLocalidades);
    setZonas(filtrarZonasSuperpuestas(nuevasZonas));
  };

  const handleShowAllLocalidades = async () => {
    if (!selectedDepartamento || localidades.length === 0) return;
    setLoadingAll(true);

    const nuevasLocalidades: Localidad[] = [];
    const nuevasZonas: LocalidadZona[] = [...zonas];

    for (const localidad of localidades) {
      if (!selectedLocalidades.some((loc) => loc.id === localidad.id)) {
        nuevasLocalidades.push(localidad);
        const polygon = await fetchPolygonForLocalidad(localidad);
        if (polygon) {
          nuevasZonas.push({
            id: localidad.id,
            name: localidad.name,
            coordinates: polygon,
          });
        }
      }
    }

    setSelectedLocalidades((prev) => [...prev, ...nuevasLocalidades]);
    setZonas(filtrarZonasSuperpuestas(nuevasZonas));
    setLoadingAll(false);
  };

  return (
    <div className="flex flex-col gap-4 relative">
      <div className="z-10 mb-4 flex items-center gap-2">
        <Select
          value={selectedDepartamento}
          onValueChange={setSelectedDepartamento}
        >
          <SelectTrigger>
            {departamentos.find((dep) => dep.id === selectedDepartamento)
              ?.name || "Seleccione un departamento"}
          </SelectTrigger>
          <SelectContent>
            {departamentos.map((dep) => (
              <SelectItem key={dep.id} value={dep.id}>
                {dep.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleShowAllLocalidades} disabled={loadingAll}>
          {loadingAll ? "Cargando..." : "Mostrar Todas"}
        </Button>
      </div>

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
          <div className="absolute top-full left-0 w-full bg-gray-800 text-white border rounded shadow-md mt-1 z-20">
            {localidades
              .filter((loc) =>
                loc.name.toLowerCase().includes(localidadInput.toLowerCase()),
              )
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
          <Badge
            key={loc.id}
            className="flex items-center gap-2 bg-blue-100 text-blue-800"
          >
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

      <div className="z-0">
        <MapaZonificacion zonas={zonas} />
      </div>
    </div>
  );
}
