import React, { useEffect, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Polygon } from "react-leaflet";
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

  useEffect(() => {
    if (mapRef.current) {
      const bounds = L.latLngBounds(
        zonas.flatMap((zona) => zona.coordinates?.flat() || []),
      );
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds);
      }
    }
  }, [zonas]);

  return (
    <MapContainer
      ref={mapRef}
      center={[0, 0]} // Default center
      zoom={5}
      style={{ height: "500px", width: "100%" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
      />
      {zonas.map((zona) =>
        zona.coordinates?.map((polygon, index) => (
          <Polygon
            key={`${zona.id}-${index}`}
            positions={polygon}
            color="blue"
            fillOpacity={0.4}
          />
        )),
      )}
    </MapContainer>
  );
}
