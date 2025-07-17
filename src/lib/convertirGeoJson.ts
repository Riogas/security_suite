/**
 * Utilidades para conversión de formatos GeoJSON
 */

/**
 * Convierte GeoJSON Polygon/MultiPolygon a formato Genexus (collection de objetos {lng, lat})
 * @param geojson - Objeto GeoJSON de tipo Polygon o MultiPolygon
 * @returns GeoJSON convertido al formato Genexus
 */
export function geojsonToGenexus(geojson: any): any {
  // Soporta Polygon o MultiPolygon
  if (!geojson || !geojson.type || !geojson.coordinates) return geojson;

  const convertRings = (rings: number[][][]) =>
    rings.map(
      (line) =>
        line.map(
          ([lng, lat]) => ({ lng, lat })
        )
    );

  if (geojson.type === "Polygon") {
    return {
      ...geojson,
      coordinates: convertRings([...geojson.coordinates])
    };
  } else if (geojson.type === "MultiPolygon") {
    // MultiPolygon: array de polígonos (array de array de array)
    return {
      ...geojson,
      coordinates: geojson.coordinates.map((rings: number[][][]) => convertRings(rings))
    };
  }
  
  return geojson;
}

/**
 * Convierte un Feature Collection completo al formato Genexus
 * @param featureCollection - GeoJSON FeatureCollection
 * @returns FeatureCollection con geometrías convertidas al formato Genexus
 */
export function convertFeatureCollectionToGenexus(featureCollection: any): any {
  if (!featureCollection || featureCollection.type !== "FeatureCollection") {
    return featureCollection;
  }

  return {
    ...featureCollection,
    features: featureCollection.features.map((feature: any) => ({
      ...feature,
      geometry: geojsonToGenexus(feature.geometry)
    }))
  };
}

/**
 * Convierte una colección de zonas separadas al formato Genexus
 * @param zonasSeparadas - Array de objetos con nombre y geojson
 * @returns Array convertido al formato Genexus
 */
export function convertZonasSeparadasToGenexus(zonasSeparadas: any[]): any[] {
  return zonasSeparadas.map(zona => ({
    ...zona,
    geojson: convertFeatureCollectionToGenexus(zona.geojson)
  }));
}
