/**
 * Ida y vuelta entre el JSON guardado en `usuario_preferencias.valor` y los
 * campos ID-Valor que edita el panel de atributos.
 *
 * Los consumidores (TrackMovil, GOYA, el propio login de secapi) leen dos
 * formatos y ninguno más:
 *
 *   - Array de objetos:  `[{"Nombre":"EL DUENDE CENTRO","Valor":14}]`
 *   - Objeto plano:      `{"Montevideo":"1000"}`
 *
 * Hasta el 2026-09-16 `generarJsonValor` era `{ [id]: valor }` con los valores
 * SIEMPRE como texto. Un array entraba a `parsearValorAtributo` como campos
 * `{id:"0", valor:'{"Nombre":...}'}` y al editarlo se volvía a guardar como
 * `{"0": "{\"Nombre\":...}"}`: un objeto cuya única clave es "0" y cuyo valor
 * es un JSON adentro de un string. Ningún consumidor lo parsea, así que un
 * usuario al que el operador le "tocó" los atributos desde el panel perdía
 * el Escenario y la EmpFletera sin que nada avisara (caso 42453714).
 *
 * La regla de acá es la inversa exacta de `parsearValorAtributo`:
 *   - un valor que es JSON de objeto se guarda como objeto, no como texto;
 *   - si los ids son "0".."n-1" en orden y todos los valores son objetos,
 *     el atributo vino de un array y vuelve a ser un array;
 *   - todo lo demás queda como objeto plano con valores string (formato legacy).
 */

export interface CampoValor {
  id: string;
  valor: string;
}

/** Parsea `valor` (JSON válido o el formato informal "{16: Rivera}") a campos ID-Valor. */
export function parsearValorAtributo(valor: string): CampoValor[] {
  try {
    const valorParseado = JSON.parse(valor);

    // Array de objetos (ej. [{"Nombre": "X", "Valor": 70}])
    if (Array.isArray(valorParseado)) {
      return valorParseado.map((item, idx) => ({
        id: String(idx),
        valor: typeof item === "object" ? JSON.stringify(item) : String(item),
      }));
    }

    // Objeto plano { clave: valor }
    if (typeof valorParseado === "object" && valorParseado !== null) {
      return Object.entries(valorParseado).map(([id, val]) => ({
        id,
        valor: typeof val === "object" ? JSON.stringify(val) : String(val),
      }));
    }
  } catch {
    // Formato informal "{16: Rivera, 17: Salto}"
    try {
      const contenido = valor.replace(/^\{|\}$/g, "").trim();
      const pares = contenido.split(",").map((par) => par.trim());

      const campos: CampoValor[] = [];
      for (const par of pares) {
        const [id, ...valorParts] = par.split(":");
        if (id && valorParts.length > 0) {
          campos.push({ id: id.trim(), valor: valorParts.join(":").trim() });
        }
      }

      if (campos.length > 0) return campos;
    } catch {
      // cae al retorno final
    }
  }

  // Si todo falla, un único campo con el texto tal cual
  return [{ id: "valor", valor }];
}

/** Si el texto es un JSON de objeto (no array, no escalar) devuelve el objeto; si no, null. */
function comoObjetoJson(texto: string): Record<string, unknown> | null {
  const t = texto.trim();
  if (!t.startsWith("{")) return null;
  try {
    const p: unknown = JSON.parse(t);
    return p !== null && typeof p === "object" && !Array.isArray(p)
      ? (p as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Arma el JSON a guardar a partir de los campos. Inversa de `parsearValorAtributo`. */
export function generarJsonValor(campos: CampoValor[]): string {
  const validos = campos.filter((c) => c.id && c.valor);
  const objetos = validos.map((c) => comoObjetoJson(c.valor));

  const vinoDeArray =
    validos.length > 0 &&
    validos.every((c, i) => c.id === String(i)) &&
    objetos.every((o) => o !== null);

  if (vinoDeArray) {
    return JSON.stringify(objetos, null, 2);
  }

  const obj: Record<string, unknown> = {};
  validos.forEach((c, i) => {
    obj[c.id] = objetos[i] ?? c.valor;
  });
  return JSON.stringify(obj, null, 2);
}
