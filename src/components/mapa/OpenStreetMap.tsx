'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

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
  const polylineRef = useRef<L.Polyline | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null); // Correct type for Leaflet map instance

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const mapInstance = L.map(mapRef.current).setView([-34.9011, -56.1645], 13); // Montevideo

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(mapInstance);

    mapInstanceRef.current = mapInstance;
  }, []);

  useEffect(() => {
    const updateMap = async () => {
      if (!mapInstanceRef.current) return;

      const map = mapInstanceRef.current;

      const safeDepartamento = departamento || '';
      const safeLocalidad = localidad || '';
      const safeDireccion = direccion || '';
      const safeNroPuerta = nroPuerta || '';

      // Centrar en el departamento/localidad
      if (safeDepartamento) {
        const coords = getCoordinatesForDepartamento(safeDepartamento, safeLocalidad);
        console.log('Coordinates for departamento/localidad:', coords);
        if (coords) {
          map.setView(coords, 13);
        }
      }

      // Pintar la calle solo si se ha actualizado la dirección
      if (safeDireccion && !safeNroPuerta) {
        const polylineCoords = await getPolylineForStreet(safeDepartamento, safeLocalidad, safeDireccion);
        console.log('Polyline coordinates for street:', polylineCoords);
        if (polylineCoords) {
          const filteredCoords = polylineCoords.filter((coord, index, self) =>
            index === self.findIndex((c) => c[0] === coord[0] && c[1] === coord[1])
          );
          const sortedCoords = filteredCoords.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          if (polylineRef.current) {
            polylineRef.current.setLatLngs(sortedCoords);
          } else {
            polylineRef.current = L.polyline(sortedCoords, { color: 'blue', weight: 4 }).addTo(map);
          }
        }
      } else if (polylineRef.current) {
        map.removeLayer(polylineRef.current);
        polylineRef.current = null;
      }

      // Colocar el pin
      if (safeDireccion && safeNroPuerta) {
        const pinCoords = getCoordinatesForAddress(safeDepartamento, safeLocalidad, safeDireccion, safeNroPuerta);
        console.log('Pin coordinates for address:', pinCoords);
        if (pinCoords) {
          if (markerRef.current) {
            markerRef.current.setLatLng(pinCoords);
          } else {
            markerRef.current = L.marker(pinCoords).addTo(map);
          }
        }
      } else if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
    };

    updateMap();
  }, [departamento, localidad, direccion, nroPuerta, esquina1, esquina2]);

  return <div ref={mapRef} className="w-full h-[300px] rounded-md shadow-md z-0" />;
}

function getCoordinatesForDepartamento(departamento: string, localidad?: string): [number, number] | null {
  const data: Record<string, [number, number]> = {
    Montevideo: [-34.9011, -56.1645],
    Canelones: [-34.6692, -56.2645],
    Maldonado: [-34.9002, -54.9501],
  };

  return data[departamento] || null;
}

async function getPolylineForStreet(departamento: string, localidad: string, direccion: string): Promise<[number, number][] | null> {
  try {
    const query = `
      [out:json];
      area[name="${departamento}"]->.searchArea;
      way["name"="${direccion}"](area.searchArea);
      out geom;
    `;

    const response = await axios.post('https://overpass-api.de/api/interpreter', query, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const data = response.data;
    if (data.elements && data.elements.length > 0) {
      const coordinates = data.elements.flatMap((element: any) =>
        element.geometry.map((point: any) => [point.lat, point.lon])
      );
      console.log('Fetched polyline coordinates:', coordinates);
      return coordinates;
    }

    console.warn('No data found for street:', direccion);
    return null;
  } catch (error) {
    console.error('Error fetching polyline data:', error);
    return null;
  }
}

function getCoordinatesForAddress(departamento: string, localidad: string, direccion: string, nroPuerta: string): [number, number] | null {
  // Mock: Devuelve coordenadas de ejemplo para una dirección completa
  return [-34.9011, -56.1645];
}
