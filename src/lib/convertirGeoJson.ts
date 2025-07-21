// Convierte un FeatureCollection Genexus (con coords {lng,lat}) a GeoJSON válido (arrays [lng,lat])
export function GenexusFeatureCollectionToGeoJson(genexusFC: any): any {
  if (!genexusFC || genexusFC.type !== "FeatureCollection" || !Array.isArray(genexusFC.features)) {
    return genexusFC;
  }
  return {
    ...genexusFC,
    features: genexusFC.features.map((feature: any) => ({
      ...feature,
      geometry: genexusToGeojson(feature.geometry),
    })),
  };
}
export type {
  GeoJsonFeatureCollection,
  GeoJsonFeature,
  GenexusFeatureCollection,
  GenexusFeature,
  GeoJsonGeometry,
  GenexusGeometry
};


// Tipos básicos GeoJSON y Genexus
type Position = [number, number];
type Ring = Position[];
type PolygonCoords = Ring[];
type MultiPolygonCoords = PolygonCoords[];

type GenexusPoint = { lng: number, lat: number };
type GenexusRing = GenexusPoint[];
type GenexusPolygonCoords = GenexusRing[];
type GenexusMultiPolygonCoords = GenexusPolygonCoords[];

interface GeoJsonGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: PolygonCoords | MultiPolygonCoords;
  [key: string]: any;
}

interface GenexusGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: GenexusPolygonCoords | GenexusMultiPolygonCoords;
  [key: string]: any;
}

interface GeoJsonFeature {
  type: "Feature";
  geometry: GeoJsonGeometry;
  properties?: Record<string, any>;
  [key: string]: any;
}

interface GenexusFeature {
  type: "Feature";
  geometry: GenexusGeometry;
  properties?: Record<string, any>;
  [key: string]: any;
}

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
  [key: string]: any;
}

interface GenexusFeatureCollection {
  type: "FeatureCollection";
  features: GenexusFeature[];
  [key: string]: any;
}

// -------- GeoJSON → Genexus (mantiene todos los anillos) --------

export function geojsonToGenexus(geojson: GeoJsonGeometry): GenexusGeometry {
  if (!geojson || !geojson.type || !geojson.coordinates) return geojson as any;

  if (geojson.type === "Polygon") {
    return {
      ...geojson,
      coordinates: (geojson.coordinates as PolygonCoords).map(
        (ring) => ring.map(([lng, lat]) => ({ lng, lat }))
      ),
    };
  }

  if (geojson.type === "MultiPolygon") {
    return {
      ...geojson,
      coordinates: (geojson.coordinates as MultiPolygonCoords).map(
        (polygon) => polygon.map(
          (ring) => ring.map(([lng, lat]) => ({ lng, lat }))
        )
      ),
    };
  }

  return geojson as any;
}

// -------- FeatureCollection (GeoJSON → Genexus) --------

export function convertFeatureCollectionToGenexus(
  featureCollection: GeoJsonFeatureCollection
): GenexusFeatureCollection {
  if (
    !featureCollection ||
    featureCollection.type !== "FeatureCollection" ||
    !Array.isArray(featureCollection.features)
  ) {
    return featureCollection as any;
  }
  return {
    ...featureCollection,
    features: featureCollection.features.map((feature) => ({
      ...feature,
      geometry: geojsonToGenexus(feature.geometry),
    })),
  };
}

// -------- Batch zonas (GeoJSON → Genexus) --------

export function convertZonasSeparadasToGenexus(zonasSeparadas: any[]): any[] {
  if (!Array.isArray(zonasSeparadas)) return zonasSeparadas;
  return zonasSeparadas.map(zona => ({
    ...zona,
    geojson: convertFeatureCollectionToGenexus(zona.geojson),
  }));
}

// -------- Genexus → GeoJSON (inverso, mantiene todos los aros) --------

export function genexusToGeojson(geometry: GenexusGeometry): GeoJsonGeometry {
  if (!geometry || !geometry.type || !geometry.coordinates) return geometry as any;

  // Polygon: coordinates puede venir como un solo array de puntos (no array de arrays)
  if (geometry.type === "Polygon") {
    let coords = geometry.coordinates as any;
    // Si es un solo anillo (array de puntos), lo envolvemos en un array
    if (Array.isArray(coords) && coords.length > 0 && !Array.isArray(coords[0])) {
      coords = [coords];
    }
    return {
      ...geometry,
      coordinates: (coords as GenexusPolygonCoords).map(
        (ring) => Array.isArray(ring)
          ? ring.map((pt) => [pt.lng, pt.lat] as Position)
          : []
      ),
    };
  }

  if (geometry.type === "MultiPolygon") {
    let coords = geometry.coordinates as any;
    // Si es un solo polígono, lo envolvemos en un array
    if (Array.isArray(coords) && coords.length > 0 && !Array.isArray(coords[0][0])) {
      coords = [coords];
    }
    return {
      ...geometry,
      coordinates: (coords as GenexusMultiPolygonCoords).map(
        (polygon) => Array.isArray(polygon)
          ? polygon.map((ring) => Array.isArray(ring)
            ? ring.map((pt) => [pt.lng, pt.lat] as Position)
            : []
          )
          : []
      ),
    };
  }

  return geometry as any;
}
