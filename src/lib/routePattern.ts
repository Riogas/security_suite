// Helpers de matching de rutas por patrón (:param / *), usados por el check de
// permisos y por la creación de solicitudes.

// Normaliza una ruta: asegura "/" inicial, quita prefijo /dashboard y "/" final.
export function normPath(p: string): string {
  let s = (p || "").trim();
  if (!s) return "/";
  if (!s.startsWith("/")) s = "/" + s;
  if (s.toLowerCase().startsWith("/dashboard")) s = s.slice("/dashboard".length) || "/";
  s = s.replace(/\/+$/, "");
  return s || "/";
}

// Convierte un patrón (ej. /clientes/:id/editar) a regex. ":x" → un segmento; "*" → resto.
export function patternToRegex(pattern: string): RegExp {
  const parts = normPath(pattern)
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) return "[^/]+";
      if (seg === "*") return ".*";
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    });
  return new RegExp("^" + parts.join("/") + "$", "i");
}

// Especificidad: más segmentos literales = más específico; menos params desempata.
export function specificity(pattern: string): number {
  const segs = normPath(pattern).split("/").filter(Boolean);
  const params = segs.filter((s) => s.startsWith(":") || s === "*").length;
  const literales = segs.length - params;
  return literales * 100 - params;
}

export const esNumerico = (s: string): boolean => /^\d+$/.test(s);

// Deriva la key del recurso "real" desde una ruta: primer segmento no numérico.
// Ej: /dashboard/moviles/10 → "moviles"; /dashboard/clientes → "clientes";
//     /5 → "" (sin recurso real). Sirve para no crear objetos basura por id.
export function recursoKeyDesdeRuta(p: string): string {
  const segs = normPath(p).split("/").filter(Boolean).filter((s) => !esNumerico(s));
  return segs[0] || "";
}
