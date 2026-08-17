// =====================================================================
// Ambiente en el que está parado el portal, derivado del host.
//
// Lo usa la UI del "Try it" para avisar, antes de ejecutar una escritura,
// contra qué está apuntando. Es una heurística a propósito: no hay ninguna
// variable de ambiente confiable del lado del cliente (`NODE_ENV` es
// "production" en cualquier build, incluida la de secapi-dev), y el host sí es
// lo que el navegador tiene delante.
//
// La regla es la de la spec (§5.3): el host contiene "dev" → DEV; si no, PROD.
//
// `localhost` cae en PROD y está bien que caiga ahí. El error caro es mostrar
// DEV cuando en realidad es producción; mostrar PROD de más solo agrega una
// confirmación que ya se iba a escribir igual. Ante la duda, el cartel rojo.
// =====================================================================

export type Ambiente = "DEV" | "PROD";

/** `host` es `location.host` (o el header Host): puede traer el puerto. */
export function ambienteDeHost(host: string): Ambiente {
  return /dev/i.test(host) ? "DEV" : "PROD";
}
