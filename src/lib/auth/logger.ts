// Logger estructurado para el flujo de login.
// IMPORTANTE: nunca loguear password ni hash. Se loguea username + verifiedBy + outcome.

type LogPayload = Record<string, unknown>;

function fmt(level: string, event: string, payload: LogPayload) {
  const safe: LogPayload = {};
  for (const [k, v] of Object.entries(payload)) {
    const lk = k.toLowerCase();
    // Defensa en profundidad: nunca emitimos campos sensibles aunque el caller los pase por error.
    if (lk === "password" || lk === "pass" || lk === "hash" || lk === "secret") continue;
    safe[k] = v;
  }
  return `[${level}] [Login] ${event} ${JSON.stringify(safe)}`;
}

export const authLog = {
  info(event: string, payload: LogPayload = {}) {
    console.log(fmt("INFO", event, payload));
  },
  warn(event: string, payload: LogPayload = {}) {
    console.warn(fmt("WARN", event, payload));
  },
  error(event: string, payload: LogPayload = {}) {
    console.error(fmt("ERROR", event, payload));
  },
};
