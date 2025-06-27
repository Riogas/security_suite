'use client';
import React, { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

export default function MapaZonificacionOSM() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const geoJsonLayerRef = useRef<any>(null);
  const [geoJsonData, setGeoJsonData] = useState<any>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          setGeoJsonData(json);
        } catch (error) {
          console.error("Error al leer el archivo GeoJSON:", error);
        }
      };
      reader.readAsText(file);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && mapRef.current && !mapInstance.current) {
      const L = require("leaflet");

      mapInstance.current = L.map(mapRef.current).setView([-34.9011, -56.1645], 13);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
      }).addTo(mapInstance.current);
    }
  }, []);

  useEffect(() => {
    if (geoJsonData && mapInstance.current) {
      const L = require("leaflet");

      // Si ya hay una capa previa, la removemos
      if (geoJsonLayerRef.current) {
        mapInstance.current.removeLayer(geoJsonLayerRef.current);
      }

      // Crear nueva capa GeoJSON
      const newLayer = L.geoJSON(geoJsonData, {
        style: (feature: any) => ({
          color: feature?.properties?.color || "#3388ff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.2,
        }),
        onEachFeature: (feature: any, layer: any) => {
          const name = feature?.properties?.name || "Sin nombre";
          layer.bindPopup(`Zona: ${name}`);
        },
      });

      newLayer.addTo(mapInstance.current);
      geoJsonLayerRef.current = newLayer;

      // Ajustar vista al contenido del GeoJSON
      try {
        mapInstance.current.fitBounds(newLayer.getBounds());
      } catch (e) {
        console.warn("No se pudo ajustar la vista del mapa:", e);
      }
    }
  }, [geoJsonData]);

  return (
    <div>
      <input
        type="file"
        accept=".geojson,application/geo+json"
        onChange={handleFileUpload}
        style={{ marginBottom: "10px" }}
      />
      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: "600px",
          border: "1px solid #ccc",
          borderRadius: "8px",
        }}
      />
    </div>
  );
}
