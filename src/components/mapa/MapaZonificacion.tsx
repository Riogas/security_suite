import React, { useEffect, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Polygon, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface LocalidadZona {
  id: string;
  name: string;
  coordinates: [number, number][][]; // Array of arrays of latitude and longitude pairs (polygons)
}

interface MapaZonificacionProps {
  zonas: LocalidadZona[];
}

export default function MapaZonificacion({ zonas }: MapaZonificacionProps) {
  const mapRef = useRef<L.Map | null>(null);

  // Forzar el repintado de los polígonos y ajuste de bounds
  function FitBoundsOnZonas({ zonas }: { zonas: LocalidadZona[] }) {
    const map = useMap();
    useEffect(() => {
      if (zonas.length > 0) {
        const bounds = L.latLngBounds(
          zonas.flatMap((zona) => zona.coordinates?.flat() || []),
        );
        if (bounds.isValid()) {
          map.fitBounds(bounds);
        }
      }
    }, [zonas, map]);
    return null;
  }

  // Colores: el último polígono (zona) será resaltado, los anteriores azul más oscuro
  const previousColor = "#1976d2"; // azul más oscuro y visible
  const lastColor = "#ff4d4f"; // rojo fuerte para el último
  const lastZonaIndex = zonas.length - 1;

  return (
    <MapContainer
      ref={mapRef}
      center={[0, 0]} // Default center
      zoom={5}
      style={{ height: "500px", width: "100%" }}
    >
      <FitBoundsOnZonas zonas={zonas} />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
      />
      {zonas.map((zona, zonaIdx) =>
        zona.coordinates?.map((polygon, index) => (
          <Polygon
            key={`${zona.id}-${index}-${zonaIdx === lastZonaIndex ? "last" : "prev"}`}
            positions={polygon}
            color={zonaIdx === lastZonaIndex ? lastColor : previousColor}
            fillOpacity={zonaIdx === lastZonaIndex ? 0.7 : 0.4}
          />
        )),
      )}
    </MapContainer>
  );
}
