"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import axios from "axios";
import { Modal } from "@/components/ui/modal"; // Importar componente Modal
import { Crosshair, Plus } from "lucide-react";
import { Button } from "@/components/ui/button"; // si estás usando ShadCN
import MapaModal from "./MapaModal";
import MapaGoogle from "./MapaGoogle";

delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type Props = {
  onChange?: (coords: { lat: string; lng: string; address?: string; houseNumber?: string }) => void;
  departamento?: string;
  localidad?: string;
  direccion?: string;
  nroPuerta?: string;
  esquina1?: string;
  esquina2?: string;
};

export default function OpenStreetMap({
  onChange,
  departamento,
  localidad,
  direccion,
  nroPuerta,
  esquina1,
  esquina2,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const polylineRefs = useRef<L.Polyline[]>([]);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Crear una referencia separada para el mapa principal
  const mainMapInstanceRef = useRef<L.Map | null>(null);

  // Crear una referencia separada para el contenedor del modal
  const modalMapRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false); // Estado para el modal
  const [statusMessage, setStatusMessage] = useState("");
  const [isManualLocationActive, setIsManualLocationActive] = useState(false); // Estado para ubicación manual
  const [formData, setFormData] = useState({
    address: '',
    houseNumber: '',
    lat: '',
    lng: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mapRef.current && !mainMapInstanceRef.current) {
      const map = L.map(mapRef.current).setView([-34.9011, -56.1645], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      mainMapInstanceRef.current = map;
    }
  }, []);

  useEffect(() => {
    console.log('Ejecución de updateMap por cambio en:', {
      departamento,
      localidad,
      direccion,
      nroPuerta,
      esquina1,
      esquina2
    });

    const updateMap = async () => {
      console.log("Instancia del mapa:", mainMapInstanceRef.current);
      if (!mainMapInstanceRef.current) return;

      const map = mainMapInstanceRef.current;
      const safeDepartamento = departamento || "";
      const safeLocalidad = localidad || "";
      const safeDireccion = direccion || "";
      const safeNroPuerta = nroPuerta || "";

      // Si NO hay dirección, pero sí departamento o localidad → centrar el mapa, sin spinner ni status
      console.log("Centrando mapa sin dirección:", safeDepartamento, safeLocalidad, safeDireccion);
      if (!safeDireccion && (safeDepartamento || safeLocalidad)) {
        console.log("Centrando mapa en departamento/localidad:", safeDepartamento, safeLocalidad);
        setIsLoading(false);
        const coords = getCoordinatesForDepartamento(
          safeDepartamento,
          safeLocalidad,
        );
        if (coords) {
          map.setView(coords, 13);
          setStatusMessage(`Centrado en: ${safeDepartamento}${safeLocalidad ? ', ' + safeLocalidad : ''}`);
        } else {
          setStatusMessage('No se encontraron coordenadas para el departamento/localidad');
        }
        setIsLoading(false);
        return;
      }

      // A partir de aquí: dirección presente → se habilita loading
      if (!safeDireccion) {
        setIsLoading(false);
        setStatusMessage("");
        return;
      }

      setIsLoading(true);
      setStatusMessage("Cargando ubicación...");

      try {
        polylineRefs.current.forEach((line) => map.removeLayer(line));
        polylineRefs.current = [];

        let foundCoords: [number, number] | null = null;

        if (safeDireccion && safeNroPuerta) {
          foundCoords = await getCoordinatesForAddress(
            safeDepartamento,
            safeLocalidad,
            safeDireccion,
            safeNroPuerta,
          );

          if (foundCoords) {
            map.setView(foundCoords, 16);
            setStatusMessage("");
          } else {
            setStatusMessage("No es posible ubicar esa dirección");
          }
        } else if (safeDireccion && esquina1) {
          foundCoords = await getCoordinatesForCorner(
            safeDepartamento,
            safeLocalidad,
            safeDireccion,
            esquina1,
          );

          if (foundCoords) {
            map.setView(foundCoords, 16);
            setStatusMessage("");
          } else {
            setStatusMessage("No es posible ubicar la esquina");
          }
        } else if (safeDireccion) {
          const segments = await getPolylineForStreet(
            safeDepartamento,
            safeLocalidad,
            safeDireccion,
          );

          if (segments && segments.length > 0) {
            segments.forEach((segment) => {
              const line = L.polyline(segment, {
                color: "blue",
                weight: 4,
              }).addTo(map);
              polylineRefs.current.push(line);
            });
            setStatusMessage("");
          } else {
            setStatusMessage("No se encontraron tramos para esa calle");
          }
        }

        if (markerRef.current) {
          map.removeLayer(markerRef.current);
          markerRef.current = null;
        }

        if (foundCoords) {
          markerRef.current = L.marker(foundCoords).addTo(map);
          if (onChange) {
            onChange({
              lat: foundCoords[0].toString(),
              lng: foundCoords[1].toString(),
            });
          }
        }
      } catch (err) {
        console.error("Error general en updateMap:", err);
        setStatusMessage("Ocurrió un error al cargar la ubicación");
      } finally {
        setIsLoading(false);
      }
    };

    updateMap();
  }, [departamento, localidad, direccion, nroPuerta, esquina1, esquina2]);

  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => {
        if (modalMapRef.current) {
          if (!mapInstanceRef.current) {
            const map = L.map(modalMapRef.current).setView(
              [-34.9011, -56.1645],
              13,
            );
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
              attribution: "&copy; OpenStreetMap contributors",
            }).addTo(map);
            mapInstanceRef.current = map;
          } else {
            mapInstanceRef.current.invalidateSize(); // Ajustar tamaño del mapa
          }
        }
      }, 500); // Incrementar tiempo para asegurar renderizado
    } else {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    }
  }, [isModalOpen]); // Reaccionar al estado del modal

  useEffect(() => {
    if (!formData.address && formData.lat && formData.lng) {
      const reverseGeocode = async () => {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${formData.lat}&lon=${formData.lng}&addressdetails=1`
          );
          const data = await response.json();

          const address = data.address.road || "Calle desconocida";
          const houseNumber = data.address.house_number?.split(",")[0] || "";

          setFormData((prev) => ({
            ...prev,
            address,
            houseNumber,
          }));

          if (onChange) {
            onChange({
              lat: formData.lat,
              lng: formData.lng,
              address,
              houseNumber,
            });
          }
        } catch (error) {
          console.error("Error en la geocodificación inversa:", error);
        }
      };

      reverseGeocode();
    }
  }, [formData.lat, formData.lng, formData.address]);

  const handleLocationChange = (data: { address: string; houseNumber: string; lat: string; lng: string }) => {
    setFormData({
      lat: data.lat,
      lng: data.lng,
      address: "", // No cargar dirección para permitir geocodificación inversa
      houseNumber: "",
    });

    console.log("Datos recibidos de MapaGoogle:", data);

    if (onChange) {
      onChange({
        lat: data.lat,
        lng: data.lng,
        address: "", // No pasar dirección para permitir geocodificación inversa
        houseNumber: "",
      });
    }
  };

  return (
    <>
      <div className="relative w-full h-[400px]">
        <div ref={mapRef} className="w-full h-full rounded-md shadow-md z-10" />

        {isLoading && direccion && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {statusMessage && (
          <div className="absolute text-black top-2 left-2 bg-white bg-opacity-90 text-sm px-3 py-1 rounded shadow z-10">
            {statusMessage}
          </div>
        )}

        <button
          className="absolute top-2 right-2 bg-blue-500 text-white px-4 py-2 rounded z-20"
          onClick={() => setIsModalOpen(true)}
        >
          Utilizar Mapa
        </button>
      </div>

      {isModalOpen && (
        <Modal onClose={() => setIsModalOpen(false)}>
            <MapaGoogle onLocationChange={handleLocationChange} />
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 2 }}>
              <label>Dirección:</label>
              <input type="text" value={formData.address} readOnly style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1, display: 'flex', gap: '10px' }}>
              <div>
                <label>Latitud:</label>
                <input type="text" value={formData.lat} readOnly style={{ width: '100%' }} />
              </div>
              <div>
                <label>Longitud:</label>
                <input type="text" value={formData.lng} readOnly style={{ width: '100%' }} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={() => setIsModalOpen(false)}
            >
              <span>Volver</span>
            </Button>
            <Button
              className="flex items-center gap-2"
              onClick={() => {
                setLoading(true);
                setTimeout(() => {
                  setLoading(false);
                  setIsModalOpen(false);
                }, 1000);
              }}
            >
              <span>Confirmar</span>
              {loading && (
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-blue-500"></div>
              )}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function getCoordinatesForDepartamento(
  departamento: string,
  localidad?: string,
): [number, number] | null {
  const data: Record<string, [number, number]> = {
    Montevideo: [-34.9011, -56.1645],
    Canelones: [-34.6692, -56.2645],
    Maldonado: [-34.9002, -54.9501],
  };
  return data[departamento] || null;
}

async function getPolylineForStreet(
  departamento: string,
  localidad: string,
  direccion: string,
): Promise<[number, number][][] | null> {
  try {
    const query = `
      [out:json][timeout:25];
      area[name="${departamento}"][admin_level=8]->.searchArea;
      way["name"="${direccion}"](area.searchArea);
      out geom;
    `;
    const response = await axios.post(
      "https://overpass-api.de/api/interpreter",
      query,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    );

    const data = response.data;
    if (data.elements && data.elements.length > 0) {
      return data.elements
        .filter((el: any) => el.type === "way" && Array.isArray(el.geometry))
        .map((el: any) =>
          el.geometry.map(
            (point: any) => [point.lat, point.lon] as [number, number],
          ),
        );
    }

    return null;
  } catch (error) {
    console.error("Error fetching polyline data:", error);
    return null;
  }
}

async function getCoordinatesForAddress(
  departamento: string,
  localidad: string,
  direccion: string,
  nroPuerta: string,
): Promise<[number, number] | null> {
  try {
    const fullAddress = `${direccion} ${nroPuerta}, ${localidad || ""}, ${departamento}, Uruguay`;

    console.log("Full address for geocoding:", fullAddress);

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1`;

    const response = await fetch(url, { headers: { "Accept-Language": "es" } });
    const data = await response.json();

    return data.length > 0
      ? [parseFloat(data[0].lat), parseFloat(data[0].lon)]
      : null;
  } catch (error) {
    console.error("Error fetching address coordinates:", error);
    return null;
  }
}

async function getCoordinatesForCorner(
  departamento: string,
  localidad: string,
  direccion: string,
  esquina: string,
): Promise<[number, number] | null> {
  try {
    const fullQuery = `${direccion} y ${esquina}, ${localidad || ""}, ${departamento}, Uruguay`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullQuery)}&limit=1`;

    const response = await fetch(url, { headers: { "Accept-Language": "es" } });
    const data = await response.json();

    return data.length > 0
      ? [parseFloat(data[0].lat), parseFloat(data[0].lon)]
      : null;
  } catch (error) {
    console.error("Error fetching corner coordinates:", error);
    return null;
  }
}
// Este componente utiliza OpenStreetMap y Leaflet para mostrar un mapa interactivo
// Permite buscar direcciones, departamentos y localidades en Uruguay
// También muestra polilíneas para calles y permite seleccionar ubicaciones con un marcador
// Utiliza Overpass API para obtener datos de OpenStreetMap
// Maneja estados de carga y mensajes de error de forma adecuada
// Permite buscar direcciones, departamentos y localidades en Uruguay
// También muestra polilíneas para calles y permite seleccionar ubicaciones con un marcador
// Utiliza Overpass API para obtener datos de OpenStreetMap
// Maneja estados de carga y mensajes de error de forma adecuadatrar un mapa interactivo
// Permite buscar direcciones, departamentos y localidades en Uruguay
// También muestra polilíneas para calles y permite seleccionar ubicaciones con un marcador
// Utiliza Overpass API para obtener datos de OpenStreetMap
// Maneja estados de carga y mensajes de error de forma adecuada