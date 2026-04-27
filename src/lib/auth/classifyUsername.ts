import type { UsernameType } from "./types";

// "alpha"   = al menos un carácter no-dígito (decide si va por ADMSEC).
// "numeric" = solo dígitos (decide si va por USUMOBILE).
// "invalid" = vacío o whitespace.
export function classifyUsername(raw: string): UsernameType {
  const trimmed = (raw || "").trim();
  if (trimmed.length === 0) return "invalid";
  if (/^\d+$/.test(trimmed)) return "numeric";
  return "alpha";
}
