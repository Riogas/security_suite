'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

// Fix para íconos de marcador en Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

type Props = {
  onChange?: (coords: { lat: string; lng: string }) => void;
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

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const mapInstance = L.map(mapRef.current).setView([-34.9011, -56.1645], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(mapInstance);

    mapInstanceRef.current = mapInstance;
  }, []);

  useEffect(() => {
    const updateMap = async () => {
      if (!mapInstanceRef.current) return;

      setIsLoading(true);
      setStatusMessage('Cargando ubicación...');

      const map = mapInstanceRef.current;

      const safeDepartamento = departamento || '';
      const safeLocalidad = localidad || '';
      const safeDireccion = direccion || '';
      const safeNroPuerta = nroPuerta || '';

      try {
        // Centrar mapa
        if (safeDepartamento) {
          const coords = getCoordinatesForDepartamento(safeDepartamento, safeLocalidad);
          if (coords) map.setView(coords, 13);
        }

        // Limpiar líneas anteriores
        polylineRefs.current.forEach((line) => map.removeLayer(line));
        polylineRefs.current = [];

        // Dibujar calle si no hay número de puerta
        if (safeDireccion && !safeNroPuerta) {
          const segments = await getPolylineForStreet(safeDepartamento, safeLocalidad, safeDireccion);
          if (segments && segments.length > 0) {
            segments.forEach((segment) => {
              const line = L.polyline(segment, { color: 'blue', weight: 4, smoothFactor: 1 }).addTo(map);
              polylineRefs.current.push(line);
            });
          }
        }

        // Colocar marcador si hay número de puerta
        if (safeDireccion && safeNroPuerta) {
          try {
            const pinCoords = await getCoordinatesForAddress(
              safeDepartamento,
              safeLocalidad,
              safeDireccion,
              safeNroPuerta
            );
            if (pinCoords) {
              if (markerRef.current) {
                markerRef.current.setLatLng(pinCoords);
              } else {
                markerRef.current = L.marker(pinCoords).addTo(map);
              }
              map.setView(pinCoords, 16); // centrar en el pin
            } else {
              setStatusMessage('No es posible ubicar esa dirección');
            }
          } catch (err) {
            console.error(err);
            setStatusMessage('No es posible ubicar esa dirección');
          }
        } else if (markerRef.current) {
          map.removeLayer(markerRef.current);
          markerRef.current = null;
        }

        setIsLoading(false);
        if (!statusMessage.includes('No es posible')) setStatusMessage('');
      } catch (err) {
        console.error('Error general en updateMap:', err);
        setStatusMessage('Ocurrió un error al cargar la ubicación');
        setIsLoading(false);
      }
    };

    updateMap();
  }, [departamento, localidad, direccion, nroPuerta, esquina1, esquina2]);

  return (
    <div className="relative w-full h-[300px]">
      <div ref={mapRef} className="w-full h-full rounded-md shadow-md z-0" />
      {(isLoading || statusMessage) && (
        <div className="absolute text-black top-2 left-2 bg-white bg-opacity-90 text-sm px-3 py-1 rounded shadow z-10">
          {statusMessage}
        </div>
      )}
    </div>
  );
}

// Coordenadas de ejemplo para centrar mapa
function getCoordinatesForDepartamento(departamento: string, localidad?: string): [number, number] | null {
  const data: Record<string, [number, number]> = {
    Montevideo: [-34.9011, -56.1645],
    Canelones: [-34.6692, -56.2645],
    Maldonado: [-34.9002, -54.9501],
  };

  return data[departamento] || null;
}

// Consulta Overpass para obtener tramos (ways) de una calle
async function getPolylineForStreet(
  departamento: string,
  localidad: string,
  direccion: string
): Promise<[number, number][][] | null> {
  try {
    const query = `
      [out:json][timeout:25];
      area[name="${departamento}"][admin_level=8]->.searchArea;
      way["name"="${direccion}"](area.searchArea);
      out geom;
    `;

    const response = await axios.post('https://overpass-api.de/api/interpreter', query, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const data = response.data;
    if (data.elements && data.elements.length > 0) {
      const segments: [number, number][][] = data.elements
        .filter((el: any) => el.type === 'way' && Array.isArray(el.geometry))
        .map((el: any) =>
          el.geometry.map((point: any) => [point.lat, point.lon] as [number, number])
        );

      return segments;
    }

    console.warn('No data found for street:', direccion);
    return null;
  } catch (error) {
    console.error('Error fetching polyline data:', error);
    return null;
  }
}

// Coordenadas para una dirección con número
async function getCoordinatesForAddress(
  departamento: string,
  localidad: string,
  direccion: string,
  nroPuerta: string
): Promise<[number, number] | null> {
  try {
    const fullAddress = `${direccion} ${nroPuerta}, ${localidad || ''}, ${departamento}, Uruguay`;

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1`;

    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'es',
      },
    });

    const data = await response.json();

    if (data.length > 0) {
      const { lat, lon } = data[0];
      return [parseFloat(lat), parseFloat(lon)];
    } else {
      console.warn('No results found for address:', fullAddress);
      return null;
    }
  } catch (error) {
    console.error('Error fetching coordinates:', error);
    return null;
  }
}
