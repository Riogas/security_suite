// Generador de código estable para ObjetoAccion (Base32 XXXX-XXXX).
// Réplica server-side del algoritmo usado en el form de objetos
// (ObjetoForm.tsx), para que los códigos generados coincidan.
// salt + `${objetoKey}|${accionKey}` → SHA-256 → Base32 → "XXXX-XXXX".

const ROUTE_SALT = "OBJ-ACCION-V1";

export async function generarAccionCodigo(
  objetoKey: string,
  accionKey: string,
): Promise<string> {
  const src = `${(objetoKey || "").trim()}|${(accionKey || "").trim()}`;
  if (!src || src === "|") return "";

  const enc = new TextEncoder().encode(`${ROUTE_SALT}|${src}`);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(digest);

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    value = 0,
    out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  const code = out.replace(/[^A-Z2-7]/g, "").slice(0, 8) || "AAAAAAAA";
  return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
}
