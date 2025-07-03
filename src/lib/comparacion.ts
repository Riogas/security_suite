/*// TIPOS MANUALES para librerías sin definición
declare module "string-similarity" {
  export function compareTwoStrings(str1: string, str2: string): number;
}
declare module "diacritics" {
  export function remove(str: string): string;
}

import stringSimilarity from "string-similarity";
import { remove as removeDiacritics } from "diacritics";
import natural from "natural";
import fastFuzzy from "fast-fuzzy";
import { getDistance } from "geolib";

// Diccionario de reemplazo inteligente
const reemplazos: Record<string, string> = {
  "av.": "avenida",
  av: "avenida",
  "gral.": "general",
  gral: "general",
  "dr.": "doctor",
  dr: "doctor",
  mt: "monte",
  "mt.": "monte",
  "18": "dieciocho",
  "25": "veinticinco",
  "8": "ocho",
  "9": "nueve",
  "7": "siete",
};

// Normalización de nombres
function normalizarNombre(nombre: string): string {
  let norm = removeDiacritics(nombre.toLowerCase().trim());
  for (const key in reemplazos) {
    const regex = new RegExp(`\\b${key}\\b`, "gi");
    norm = norm.replace(regex, reemplazos[key]);
  }
  return norm.replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
}

// Interfaces
export interface CalleSistema {
  nombre: string;
}

export interface CalleOverpass {
  name?: string;
  old_name?: string;
  lat?: number;
  lng?: number;
}

export interface ResultadoComparacion {
  calleSistema: string;
  calleOverpass: string;
  oldName?: string;
  porcentaje: number;
  distanciaMetros?: number;
  metodoCoincidencia: string;
}

// Comparación de coordenadas (si están disponibles)
function distanciaGeografica(
  a: CalleSistema,
  b: CalleOverpass,
): number | undefined {
  if (
    "lat" in a &&
    "lng" in a &&
    (a as any).lat != null &&
    (a as any).lng != null &&
    b.lat != null &&
    b.lng != null
  ) {
    return getDistance(
      { latitude: (a as any).lat, longitude: (a as any).lng },
      { latitude: b.lat, longitude: b.lng },
    );
  }
  return undefined;
}

// Función principal
export function compararCallesAvanzado(
  callesSistema: CalleSistema[],
  callesOverpass: CalleOverpass[],
  umbral: number = 0.6,
): ResultadoComparacion[] {
  const resultados: ResultadoComparacion[] = [];

  for (const calleSis of callesSistema) {
    const nombreNormSis = normalizarNombre(calleSis.nombre);

    // Extraer todos los nombres disponibles de overpass (name y old_name)
    const opcionesOver = callesOverpass.flatMap((c) =>
      [c.name, c.old_name].filter(Boolean).map((nombre) => ({
        overpass: c,
        nombreOriginal: nombre!,
        nombreNormalizado: normalizarNombre(nombre!),
      })),
    );

    let mejor: ResultadoComparacion | null = null;

    for (const over of opcionesOver) {
      const jwScore = natural.JaroWinklerDistance(
        nombreNormSis,
        over.nombreNormalizado,
      );
      const strSim = stringSimilarity.compareTwoStrings(
        nombreNormSis,
        over.nombreNormalizado,
      );
      const porcentaje = Math.max(jwScore, strSim);
      const distancia = distanciaGeografica(calleSis, over.overpass);

      if (!mejor || porcentaje > mejor.porcentaje) {
        mejor = {
          calleSistema: calleSis.nombre,
          calleOverpass: over.overpass.name || "",
          oldName: over.overpass.old_name,
          porcentaje,
          distanciaMetros: distancia,
          metodoCoincidencia:
            jwScore > strSim ? "Jaro-Winkler" : "StringSimilarity",
        };
      }
    }

    // Comparación adicional con fast-fuzzy
    const fuzzyMatch = fastFuzzy.search(
      nombreNormSis,
      opcionesOver.map((o) => o.nombreNormalizado),
      { returnMatchData: true },
    )[0];

    if (fuzzyMatch && fuzzyMatch.score > (mejor?.porcentaje || 0)) {
      const index = opcionesOver.findIndex(
        (o) => o.nombreNormalizado === fuzzyMatch.item,
      );
      const overFuzzy = opcionesOver[index];
      mejor = {
        calleSistema: calleSis.nombre,
        calleOverpass: overFuzzy.overpass.name || "",
        oldName: overFuzzy.overpass.old_name,
        porcentaje: fuzzyMatch.score,
        distanciaMetros: distanciaGeografica(calleSis, overFuzzy.overpass),
        metodoCoincidencia: "fast-fuzzy",
      };
    }

    if (mejor && mejor.porcentaje >= umbral) {
      resultados.push(mejor);
    }
  }

  return resultados.sort((a, b) => b.porcentaje - a.porcentaje);
}
*/