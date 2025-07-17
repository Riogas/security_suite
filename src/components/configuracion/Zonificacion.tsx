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
  apiGetPuestos,
  apiGetTiposCapa,
  apiImportarZona,
} from "@/services/api";
import { Badge } from "@/components/ui/badge";
import MapaZonificacion from "@/components/mapa/MapaZonificacion";
import { Button } from "@/components/ui/button";
import booleanContains from "@turf/boolean-contains";
import { polygon as turfPolygon } from "@turf/helpers";
import GuardarZonaModal from "@/components/configuracion/modals/GuardarZonaModal";
import { toast } from "sonner";
import { 
  convertFeatureCollectionToGenexus, 
  convertZonasSeparadasToGenexus 
} from "@/lib/convertirGeoJson";

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

interface Puesto {
  id: string;
  name: string;
}

interface TipoCapa {
  id: string;
  name: string;
}

interface LocalidadZona {
  id: string;
  name: string;
  coordinates: [number, number][][];
  color?: string;
  shouldSimplify?: boolean; // true para zonas de localidades, false para importadas
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
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [tiposCapa, setTiposCapa] = useState<TipoCapa[]>([]);
  const [selectedDepartamento, setSelectedDepartamento] = useState<string>("");
  const [selectedPuesto, setSelectedPuesto] = useState<string>("");
  const [selectedTipoCapa, setSelectedTipoCapa] = useState<string>("");
  const [selectedLocalidades, setSelectedLocalidades] = useState<Localidad[]>(
    [],
  );
  const [localidadInput, setLocalidadInput] = useState<string>("");
  const [zonas, setZonas] = useState<LocalidadZona[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [isGuardarModalOpen, setIsGuardarModalOpen] = useState(false);

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
    const fetchPuestos = async () => {
      try {
        const data = await apiGetPuestos();
        const filtered: Puesto[] = data.sdtPuestosData.map((puesto: any) => ({
          id: puesto.PuestoId,
          name: puesto.PuestoDsc,
        }));
        setPuestos(filtered);
      } catch (error) {
        console.error("Error fetching puestos:", error);
      }
    };
    fetchPuestos();
  }, []);

  useEffect(() => {
    const fetchTiposCapa = async () => {
      try {
        const data = await apiGetTiposCapa();
        const filtered: TipoCapa[] = data.sdtTipoCapa.map((tipo: any) => ({
          id: tipo.TipoCapaId,
          name: tipo.TipoCapaNombre,
        }));
        setTiposCapa(filtered);
      } catch (error) {
        console.error("Error fetching tipos de capa:", error);
      }
    };
    fetchTiposCapa();
  }, []);

  useEffect(() => {
    const fetchLocalidades = async () => {
      if (!selectedDepartamento) return;
      const data = await apiGetLocalidades({
        DepartamentoId: selectedDepartamento,
      });
      const filtered: Localidad[] = data.sdtLocalidad
        //.filter((loc: any) => loc.LocalidadEstado === "S") // ✅ Filtrar por estado
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

  // Modificado: Si no hay lat/lon, buscar por bounding box usando Nominatim
  const fetchPolygonForLocalidad = async (localidad: Localidad) => {
  try {
    console.log("🔍 Iniciando fetchPolygonForLocalidad para:", localidad);

    let polygonData = null;

    if (localidad.lat && localidad.lon) {
      console.log("📍 Usando coordenadas:", localidad.lat, localidad.lon);
      polygonData = await apiGetPolygonForLocalidad(localidad.lat, localidad.lon);
      console.log("📦 polygonData desde coordenadas:", polygonData);
    }

    // Fallback: si no hay datos o el array viene vacío, usar bounding box por nombre
    if (
      !polygonData ||
      !polygonData.elements ||
      polygonData.elements.length === 0 ||
      !localidad.lat ||
      !localidad.lon
    ) {
      console.warn("⚠️ No se encontró polygonData útil. Intentando vía Nominatim...");

      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=uy&extratags=1&limit=1&q=${encodeURIComponent(localidad.name + ', Uruguay')}`;
      console.log("🌐 Consultando Nominatim:", nominatimUrl);

      const responseNominatim = await fetch(nominatimUrl, {
        headers: {
          "User-Agent": "TuApp/1.0 (tu@email.com)",
        },
      });

      const nominatimData = await responseNominatim.json();
      console.log("📦 Respuesta de Nominatim:", nominatimData);

      if (nominatimData.length > 0) {
        const bbox = nominatimData[0].boundingbox;
        const [south, north, west, east] = bbox.map(parseFloat);
        console.log("📐 Bounding box obtenida:", { south, north, west, east });

                const lat = (south + north) / 2;
        const lon = (west + east) / 2;

        const buscarAreaDesdeCentroQuery = `
          [out:json][timeout:25];
          is_in(${lat}, ${lon});
          area._["admin_level"="8"]["boundary"="administrative"];
          out ids tags;
        `;

        const responseArea = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: buscarAreaDesdeCentroQuery,
        });

        const dataArea = await responseArea.json();
        const areaId = dataArea.elements?.[0]?.id;

        if (!areaId) throw new Error("No se encontró área desde bounding box");

        const polygonQuery = `
          [out:json][timeout:60];
          rel(area:${areaId})["boundary"="administrative"]["admin_level"="8"];
          out body;
          >;
          out skel qt;
        `;

        const responsePolygon = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: polygonQuery,
        });

        polygonData = await responsePolygon.json();

        // Ya se obtuvo polygonData desde la consulta Overpass anterior
      } else {
        console.warn("⚠️ Nominatim no devolvió resultados para:", localidad.name);
      }
    }

    if (!polygonData || !polygonData.elements) {
      console.warn("❌ No se encontraron elementos en polygonData");
      return null;
    }

    console.log("✅ Procesando elementos de polygonData...");
    const nodesById = new Map<number, [number, number]>();
    const waysById = new Map<number, number[]>();

    for (const el of polygonData.elements) {
      if (el.type === "node") nodesById.set(el.id, [el.lat, el.lon]);
      else if (el.type === "way") waysById.set(el.id, el.nodes);
    }

    const relations = polygonData.elements.filter((el: any) => el.type === "relation");
    console.log("🔗 Relaciones encontradas:", relations.length);

    const polygons: [number, number][][] = [];

    for (const rel of relations) {
      const outerWays = rel.members
        .filter((m: any) => m.role === "outer" && m.type === "way")
        .map((m: any) => waysById.get(m.ref))
        .filter((nodes: any): nodes is number[] => !!nodes);

      console.log(`🔄 Relation ${rel.id} tiene ${outerWays.length} outer ways`);

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

      if (polygonCoords.length > 0) {
        console.log(`✅ Polígono construido con ${polygonCoords.length} puntos`);
        polygons.push(polygonCoords);
      } else {
        console.warn(`⚠️ Polígono vacío en relation ${rel.id}`);
      }
    }

    if (polygons.length === 0) {
      console.warn("❌ No se construyó ningún polígono válido");
      return null;
    }

    console.log("✅ Total de polígonos devueltos:", polygons.length);
    return polygons;
  } catch (error) {
    console.error("❌ Error fetching polygon for localidad:", error);
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
          { id: localidad.id, name: localidad.name, coordinates: polygon, shouldSimplify: true },
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
            shouldSimplify: true, // Simplificar zonas de localidades
          });
        }
      }
    }

    setSelectedLocalidades((prev) => [...prev, ...nuevasLocalidades]);
    setZonas(filtrarZonasSuperpuestas(nuevasZonas));
    setLoadingAll(false);
  };

  // Exportar zonas a GeoJSON
  const handleExportGeoJSON = () => {
    const geojson = {
      type: "FeatureCollection",
      features: zonas.map((zona) => ({
        type: "Feature",
        properties: { 
          id: zona.id, 
          name: zona.name,
          ...(zona.color && {
            _umap_options: {
              color: zona.color
            }
          })
        },
        geometry: {
          type: "Polygon",
          coordinates: zona.coordinates.map((ring) => 
            ring.map(([lat, lon]) => [lon, lat])
          )
        }
      }))
    };
    
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { 
      type: "application/geo+json" 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zonas.geojson";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  // Importar zonas desde GeoJSON
  const handleImportGeoJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const geojson = JSON.parse(event.target?.result as string);
        if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
          alert("El archivo no es un GeoJSON válido");
          return;
        }
        
        const nuevasZonas: LocalidadZona[] = geojson.features.map((feature: any, idx: number) => {
          const coords = feature.geometry?.coordinates;
          // Convertir [lon, lat] a [lat, lon]
          const rings = coords?.map((ring: any) => 
            ring.map(([lon, lat]: [number, number]) => [lat, lon])
          ) || [];
          
          // Extraer color de _umap_options si existe
          const color = feature.properties?._umap_options?.color;
          
          return {
            id: feature.properties?.id || `imported-${idx}`,
            name: feature.properties?.name || `Zona importada ${idx + 1}`,
            coordinates: rings,
            shouldSimplify: false, // No simplificar zonas importadas
            ...(color && { color })
          };
        });
        
        setZonas(filtrarZonasSuperpuestas([...zonas, ...nuevasZonas]));
      } catch (err) {
        alert("Error al importar el archivo GeoJSON");
      }
    };
    reader.readAsText(file);
    // Limpiar input para permitir importar el mismo archivo de nuevo si se desea
    e.target.value = "";
  };

  // 🔧 Función para dividir GeoJSON por zonas
  const splitGeoJsonByZona = (geojson: any) => {
    const zonasMap: { [key: string]: any[] } = {};

    for (const feature of geojson.features) {
      const zona = feature.properties.name || feature.properties.nombre || `Zona-${feature.properties.id}`;
      if (!zonasMap[zona]) {
        zonasMap[zona] = [];
      }
      zonasMap[zona].push(feature);
    }

    // Convertir cada grupo en un GeoJSON
    const coleccion = Object.entries(zonasMap).map(([nombre, features]) => ({
      nombre,
      geojson: {
        type: "FeatureCollection",
        features
      }
    }));

    return coleccion;
  };

  // 💾 Función para guardar zona
  const handleGuardarZona = async (capaNombre: string) => {
    try {
      if (!selectedPuesto || !selectedTipoCapa) {
        toast.error("Debe seleccionar un puesto y tipo de capa");
        return;
      }

      if (zonas.length === 0) {
        toast.error("No hay zonas dibujadas para guardar");
        return;
      }

      // Generar GeoJSON completo de las zonas
      const capaGeoJson = {
        type: "FeatureCollection",
        features: zonas.map((zona) => ({
          type: "Feature",
          properties: { 
            id: zona.id, 
            name: zona.name,
            ...(zona.color && {
              _umap_options: {
                color: zona.color
              }
            })
          },
          geometry: {
            type: "Polygon",
            coordinates: zona.coordinates.map((ring) => 
              ring.map(([lat, lon]) => [lon, lat])
            )
          }
        }))
      };

      // Dividir por zonas
      const zonasSeparadas = splitGeoJsonByZona(capaGeoJson);

      // 🔄 Convertir al formato Genexus antes de enviar
      const capaGeoJsonGenexus = convertFeatureCollectionToGenexus(capaGeoJson);
      const zonasSeparadasGenexus = convertZonasSeparadasToGenexus(zonasSeparadas);

      await apiImportarZona(
        parseInt(selectedPuesto),
        parseInt(selectedTipoCapa),
        capaNombre,
        JSON.stringify(capaGeoJsonGenexus),
        JSON.stringify(zonasSeparadasGenexus)
      );

      toast.success("Zona guardada exitosamente");
    } catch (error) {
      console.error("Error al guardar zona:", error);
      toast.error("Error al guardar la zona");
      throw error;
    }
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
        <Button variant="outline" onClick={handleExportGeoJSON}>
          Exportar
        </Button>
        <Button variant="outline" asChild>
          <label className="cursor-pointer">
            Importar
            <input 
              type="file" 
              accept="application/geo+json,.geojson,.json" 
              className="hidden" 
              onChange={handleImportGeoJSON} 
            />
          </label>
        </Button>
        
        <div className="ml-auto flex items-center gap-2">
          <Select
            value={selectedPuesto}
            onValueChange={setSelectedPuesto}
          >
            <SelectTrigger className="w-[200px]">
              {puestos.find((puesto) => puesto.id === selectedPuesto)
                ?.name || "Seleccione un puesto"}
            </SelectTrigger>
            <SelectContent>
              {puestos.map((puesto) => (
                <SelectItem key={puesto.id} value={puesto.id}>
                  {puesto.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select
            value={selectedTipoCapa}
            onValueChange={setSelectedTipoCapa}
          >
            <SelectTrigger className="w-[200px]">
              {tiposCapa.find((tipo) => tipo.id === selectedTipoCapa)
                ?.name || "Seleccione tipo de capa"}
            </SelectTrigger>
            <SelectContent>
              {tiposCapa.map((tipo) => (
                <SelectItem key={tipo.id} value={tipo.id}>
                  {tipo.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button 
            variant="default"
            onClick={() => setIsGuardarModalOpen(true)}
            disabled={!selectedPuesto || !selectedTipoCapa || zonas.length === 0}
            className="transition-all duration-200 hover:scale-105 hover:shadow-lg"
          >
            Guardar
          </Button>
        </div>
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
        <MapaZonificacion
          zonas={zonas}
          onRename={(id, newName) => {
            setZonas((prev) =>
              prev.map((zona) =>
                zona.id === id ? { ...zona, name: newName } : zona
              )
            );
          }}
          onRemove={(id) => {
            setZonas((prev) => prev.filter((zona) => zona.id !== id));
            setSelectedLocalidades((prev) => prev.filter((loc) => loc.id !== id));
          }}
          onEdit={(id, newCoords) => {
            setZonas((prev) =>
              prev.map((zona) =>
                zona.id === id ? { ...zona, coordinates: newCoords } : zona
              )
            );
          }}
        />
      </div>
      
      <GuardarZonaModal
        isOpen={isGuardarModalOpen}
        onClose={() => setIsGuardarModalOpen(false)}
        onConfirm={handleGuardarZona}
      />
    </div>
  );
}
