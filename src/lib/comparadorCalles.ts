import { distance as levenshtein } from "fastest-levenshtein";
import removeDiacritics from "diacritics";
import numalet from "numalet";

// Diccionario de abreviaturas
const ABBREVIATIONS: Record<string, string> = {
  av: "avenida",
  gral: "general",
  dr: "doctor",
  sr: "señor",
  sra: "señora",
  sta: "santa",
  san: "san",
  ex: "ex",
  ruta: "ruta",
  pte: "presidente",
  prof: "profesor",
  cap: "capitán",
  cnel: "coronel",
  ing: "ingeniero",
  mjr: "mayor",
  ten: "teniente",
  alf: "alférez",
  cno: "camino",
  "cno.": "camino",
};

// Normaliza: minúsculas, sin tildes, sin signos, sin puntos, trim
export function normalizeString(str: string): string {
  if (!str) return "";
  let s = str.toLowerCase();
  s = removeDiacritics.remove(s);
  s = s.replace(/[.,;:!?¿¡'"()\[\]{}]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// Expande abreviaturas
export function expandAbbreviations(str: string): string {
  return str
    .split(" ")
    .map((word) => ABBREVIATIONS[word] || word)
    .join(" ");
}

// Convierte números a texto (en español)
const na = numalet(); // se instancia una vez

export function numbersToWords(str: string): string {
  return str.replace(/\b\d+\b/g, (num) => na(Number(num)).toLowerCase());
}

// Aplica todo el pipeline de normalización
export function normalizeCalle(str: string): string {
  let s = normalizeString(str);
  s = expandAbbreviations(s);
  s = numbersToWords(s);
  return s;
}

// String similarity simple (Jaccard sobre palabras)
export function stringSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(" "));
  const setB = new Set(b.split(" "));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// Color de confianza
export function confidenceColor(score: number): string {
  if (score > 0.9) return "#22c55e"; // verde
  if (score > 0.7) return "#eab308"; // amarillo
  if (score > 0.5) return "#f97316"; // naranja
  return "#ef4444"; // rojo
}

// Comparador principal
export interface ComparacionCalle {
  base: any;
  candidato: any;
  score: number;
  distancia: number;
  color: string;
}

export function compararCalles(
  callesBase: any[],
  callesCandidatas: any[],
  baseKey: string = "CalleNombre",
  candidataKey: string = "CalNom",
): ComparacionCalle[] {
  const resultados: ComparacionCalle[] = [];

  for (const base of callesBase) {
    let mejorScore = -1;
    let mejorCandidato = null;
    let mejorDist = Infinity;
    let mejorColor = "#ef4444";

    const nombreBase = normalizeCalle(base[baseKey]);

    for (const candidato of callesCandidatas) {
      const nombreCandidato = normalizeCalle(candidato[candidataKey]);
      const dist = levenshtein(nombreBase, nombreCandidato);
      const sim = stringSimilarity(nombreBase, nombreCandidato);

      const score =
        0.7 * sim +
        0.3 * (1 - Math.min(dist / Math.max(nombreBase.length, 1), 1));

      if (score > mejorScore) {
        mejorScore = score;
        mejorCandidato = candidato;
        mejorDist = dist;
        mejorColor = confidenceColor(score);
      }
    }

    resultados.push({
      base,
      candidato: mejorCandidato,
      score: mejorScore,
      distancia: mejorDist,
      color: mejorColor,
    });
  }

  return resultados;
}
