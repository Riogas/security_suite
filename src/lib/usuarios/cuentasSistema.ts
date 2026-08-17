// Heurística para no importar por accidente cuentas de servicio.
// ADMSEC tiene ROOT, DAEMONS, INCIDENTES, PUESTOPRUEBA y similares mezclados
// con las personas. Se marcan y vienen destildadas, pero se pueden importar.

const DEFAULT_CUENTAS_SISTEMA = "ROOT,DAEMONS,INCIDENTES,PUESTOPRUEBA,ADMINISTRADOR";

function listaConfigurada(): Set<string> {
  const raw = process.env.CUENTAS_SISTEMA || DEFAULT_CUENTAS_SISTEMA;
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
}

export function esCuentaSistema(username: string): boolean {
  const u = (username || "").trim().toUpperCase();
  if (!u) return false;
  return listaConfigurada().has(u);
}
