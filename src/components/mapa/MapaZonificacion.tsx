import React, { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Polygon,
  useMap,
  Popup,
  Tooltip,
  FeatureGroup,
} from "react-leaflet";
// @ts-ignore
import simplify from "@turf/simplify";
import { polygon as turfPolygon } from "@turf/helpers";
import { EditControl } from "react-leaflet-draw";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

interface LocalidadZona {
  id: string;
  name: string;
  coordinates: [number, number][][];
}

interface MapaZonificacionProps {
  zonas: LocalidadZona[];
  onRename: (id: string, newName: string) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string, newCoords: [number, number][][]) => void;
}

function FitBoundsOnZonas({ zonas }: { zonas: LocalidadZona[] }) {
  const map = useMap();

  useEffect(() => {
    if (zonas.length > 0) {
      const bounds = L.latLngBounds(zonas.flatMap((z) => z.coordinates?.flat() || []));
      if (bounds.isValid()) map.fitBounds(bounds);
    }
  }, [zonas, map]);

  return null;
}

export default function MapaZonificacion({
  zonas,
  onRename,
  onRemove,
  onEdit,
}: MapaZonificacionProps) {
  const mapRef = useRef<L.Map | null>(null);
  const featureGroupRef = useRef<L.FeatureGroup>(null);

  const [selectedZona, setSelectedZona] = useState<string | null>(null);
  const [renamingZona, setRenamingZona] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editingZona, setEditingZona] = useState<string | null>(null);

  const previousColor = "#1976d2";
  const lastColor = "#ff4d4f";
  const lastZonaIndex = zonas.length - 1;

  useEffect(() => {
    if (renamingZona) setSelectedZona(renamingZona);
  }, [renamingZona]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (editingZona) {
      mapRef.current.dragging?.disable();
    } else {
      mapRef.current.dragging?.enable();
    }
  }, [editingZona]);

  // Simplify polygons for editing (less points, easier handles)
  const simplifiedZonas = useMemo(() => {
    // Tolerance: adjust for more/less simplification (in degrees, e.g. 0.0005 ~ 50m)
    const tolerance = 0.0005;
    return zonas.map((zona) => {
      try {
        // Only simplify if there are many points
        const needsSimplify = zona.coordinates[0]?.length > 30;
        if (!needsSimplify) return zona;
        // Convert [lat, lng] to [lng, lat] for turf
        const turfCoords = zona.coordinates.map(
          (ring) => ring.map(([lat, lng]) => [lng, lat])
        );
        const poly = turfPolygon(turfCoords);
        const simplified = simplify(poly, { tolerance, highQuality: false });
        // Convert back to [lat, lng]
        const coords = simplified.geometry.coordinates.map(
          (ring: any) => ring.map(([lng, lat]: [number, number]) => [lat, lng])
        );
        // Fallback if simplification failed or returned empty
        if (!coords.length || !coords[0].length) return zona;
        return { ...zona, coordinates: coords };
      } catch {
        return zona;
      }
    });
  }, [zonas]);

  // Render all polygons inside the FeatureGroup so they are editable
  const renderFeatureGroup = () => {
    return (
      <FeatureGroup ref={featureGroupRef}>
        {simplifiedZonas.map((zona, zonaIdx) =>
          zona.coordinates?.map((polygon: [number, number][], index: number) => (
            <Polygon
              key={`${zona.id}-${index}`}
              positions={polygon}
              color={zonaIdx === lastZonaIndex ? lastColor : previousColor}
              fillOpacity={zonaIdx === lastZonaIndex ? 0.7 : 0.4}
              eventHandlers={{
                dblclick: (e) => {
                  setSelectedZona(zona.id);
                  e.originalEvent.preventDefault();
                  e.originalEvent.stopPropagation();
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -20]} permanent>
                <span
                  style={{
                    fontWeight: 600,
                    color: "#222",
                    textShadow: "0 1px 2px #fff",
                  }}
                >
                  {zona.name}
                </span>
              </Tooltip>
              {selectedZona === zona.id && (
                <Popup
                  position={polygon[0]}
                  eventHandlers={{
                    remove: () => {
                      setSelectedZona(null);
                      setRenamingZona(null);
                      setEditingZona(null);
                    },
                  }}
                  autoPan={false}
                >
                  {renamingZona === zona.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        onRename(zona.id, renameValue);
                        setRenamingZona(null);
                      }}
                      className="flex flex-col gap-2"
                    >
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        autoFocus
                        className="border rounded px-2 py-1"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="bg-blue-600 text-white px-2 py-1 rounded"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="bg-gray-300 px-2 py-1 rounded"
                          onClick={() => setRenamingZona(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col gap-2 min-w-[140px]">
                      <div className="font-bold mb-1">{zona.name}</div>
                      <button
                        className="bg-blue-600 text-white px-2 py-1 rounded"
                        onClick={() => {
                          setRenamingZona(zona.id);
                          setRenameValue(zona.name);
                        }}
                      >
                        Renombrar
                      </button>
                      <button
                        className="bg-red-600 text-white px-2 py-1 rounded"
                        onClick={() => onRemove(zona.id)}
                      >
                        Quitar
                      </button>
                    </div>
                  )}
                </Popup>
              )}
            </Polygon>
          ))
        )}
        <EditControl
          position="topright"
          draw={{
            polyline: false,
            rectangle: false,
            circle: false,
            marker: false,
            circlemarker: false,
            polygon: true,
          }}
          edit={{
            featureGroup: featureGroupRef.current ?? undefined,
            remove: true,
          }}
          onCreated={(e: any) => {
            if (e.layerType === "polygon") {
              const layer = e.layer;
              const latlngs = layer.getLatLngs();
              const coords = [latlngs[0].map((latlng: any) => [latlng.lat, latlng.lng])];
              const newId = `custom-${Date.now()}`;
              onEdit(newId, coords);
              setRenamingZona(newId);
              setRenameValue("Nueva zona");
            }
          }}
          onEdited={(e: any) => {
            e.layers.eachLayer((layer: any) => {
              const latlngs = layer.getLatLngs();
              const coords = [latlngs[0].map((latlng: any) => [latlng.lat, latlng.lng])];
              // Find zona by first point
              const first = coords[0][0];
              const zona = zonas.find(z => z.coordinates[0][0][0] === first[0] && z.coordinates[0][0][1] === first[1]);
              if (zona) {
                onEdit(zona.id, coords);
              }
            });
          }}
          onDeleted={(e: any) => {
            e.layers.eachLayer((layer: any) => {
              const latlngs = layer.getLatLngs();
              const coords = [latlngs[0].map((latlng: any) => [latlng.lat, latlng.lng])];
              const first = coords[0][0];
              const zona = zonas.find(z => z.coordinates[0][0][0] === first[0] && z.coordinates[0][0][1] === first[1]);
              if (zona) {
                onRemove(zona.id);
              }
            });
          }}
        />
      </FeatureGroup>
    );
  };

  return (
    <MapContainer
      ref={mapRef}
      center={[0, 0]}
      zoom={5}
      style={{ height: "500px", width: "100%" }}
    >
      <FitBoundsOnZonas zonas={zonas} />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      {renderFeatureGroup()}
    </MapContainer>
  );
}
