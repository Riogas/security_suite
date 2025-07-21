"use client";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface MostrarMapaModalProps {
  isOpen: boolean;
  onClose: () => void;
  geojson: any;
  title?: string;
  description?: string;
}

export default function MostrarMapaModal({
  isOpen,
  onClose,
  geojson,
  title = "Mapa de la Capa",
  description = "Visualización del polígono de la capa en el mapa.",
}: MostrarMapaModalProps) {
  const [LMap, setLMap] = useState<any>(null);
  const [LTileLayer, setLTileLayer] = useState<any>(null);
  const [LGeoJSON, setLGeoJSON] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      (async () => {
        try {
          const leaflet = await import("react-leaflet");
          setLMap(() => leaflet.MapContainer);
          setLTileLayer(() => leaflet.TileLayer);
          setLGeoJSON(() => leaflet.GeoJSON);
          // @ts-ignore
          await import("leaflet/dist/leaflet.css");
        } catch (err) {
          toast.error("Error cargando el mapa");
        }
      })();
    }
  }, [isOpen]);


  // Calcular bounds de todos los puntos del geojson
  function getGeoJsonBounds(geojson: any): [[number, number], [number, number]] | null {
    let lats: number[] = [];
    let lngs: number[] = [];
    if (!geojson || !geojson.features) return null;
    geojson.features.forEach((feature: any) => {
      const geom = feature.geometry;
      if (!geom) return;
      if (geom.type === "Polygon") {
        geom.coordinates.forEach((ring: any) => {
          ring.forEach(([lng, lat]: [number, number]) => {
            lats.push(lat);
            lngs.push(lng);
          });
        });
      } else if (geom.type === "MultiPolygon") {
        geom.coordinates.forEach((polygon: any) => {
          polygon.forEach((ring: any) => {
            ring.forEach(([lng, lat]: [number, number]) => {
              lats.push(lat);
              lngs.push(lng);
            });
          });
        });
      }
    });
    if (lats.length && lngs.length) {
      return [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ];
    }
    return null;
  }

  const bounds = getGeoJsonBounds(geojson);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-500 ease-out shadow-2xl">
        <DialogHeader className="animate-in slide-in-from-top-2 duration-700 delay-100">
          <DialogTitle className="animate-in zoom-in-50 duration-500 delay-200">
            {title}
          </DialogTitle>
          <DialogDescription className="animate-in fade-in duration-600 delay-300">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="h-[400px] w-full rounded border mb-2 bg-gray-100">
          {LMap && LTileLayer && LGeoJSON && geojson ? (
            <LMap
              style={{ height: "100%", width: "100%" }}
              bounds={bounds as any}
              boundsOptions={{ padding: [30, 30] }}
              zoom={12}
            >
              <LTileLayer url="http://osmtileserver.riogas.uy/tile/{z}/{x}/{y}.png" />
              <LGeoJSON data={geojson} />
            </LMap>
          ) : (
            <div className="flex items-center justify-center h-full">Cargando mapa...</div>
          )}
        </div>
        <DialogFooter className="animate-in slide-in-from-bottom-4 duration-600 delay-500">
          <Button type="button" variant="outline" onClick={onClose} className="transition-all duration-200 hover:scale-105">
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
