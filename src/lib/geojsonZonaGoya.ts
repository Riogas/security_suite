// Convierte el string de ZonaGeoJson (array de puntos {lng,lat}) a un FeatureCollection GeoJSON válido
export function zonaGoyaStringToGeoJson(
  zonaGeoJsonString: string,
  zonaId?: string,
  zonaNombre?: string
): any {
  let points: [number, number][] = [];
  try {
    points = (JSON.parse(zonaGeoJsonString) as { lng: string | number; lat: string | number }[])
      .map((pt) => [parseFloat(pt.lng as string), parseFloat(pt.lat as string)]);
  } catch {
    return null;
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [points],
        },
        properties: {
          ZonaId: zonaId,
          ZonaNombre: zonaNombre,
        },
      },
    ],
  };
}
