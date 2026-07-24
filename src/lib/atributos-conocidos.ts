/**
 * Catálogo de atributos ("preferencias") conocidos de RBAC RioGas.
 *
 * La UI de atributos (usuarios y roles) autocompleta el nombre del atributo
 * ("Descripción del Atributo") a partir de `/api/db/usuario-preferencias/sugerencias`,
 * que SOLO deriva nombres de las filas ya existentes en `usuario_preferencias`.
 * Por eso un atributo todavía no asignado —o asignado solo a un rol— no aparecía
 * como opción seleccionable.
 *
 * Este catálogo estático se mergea con esas sugerencias en `CrearAtributoPanel`
 * para que los atributos conocidos SIEMPRE estén disponibles para elegir (tanto en
 * el modal de usuario como en el de rol), sin necesidad de asignárselos a nadie
 * primero. Agregar acá un atributo nuevo lo vuelve seleccionable en toda la UI.
 *
 * Nota: son sugerencias de nombre; el usuario igual puede tipear cualquier otro.
 */
export interface AtributoConocido {
  /** Nombre exacto del atributo tal como lo lee la app destino (case-sensitive). */
  nombre: string;
  /** Ayuda breve para el operador (no se persiste). */
  descripcion?: string;
}

export const ATRIBUTOS_CONOCIDOS: AtributoConocido[] = [
  {
    nombre: "ModoKiosko",
    descripcion:
      "RiogasTracking: PC de pared. Sesión sin expiración + persistida; rollover a medianoche. Valor truthy (true/S/1).",
  },
  {
    nombre: "PantallaLogin",
    descripcion:
      "RiogasTracking: pantalla de aterrizaje al iniciar sesión (ej. { Pantalla: stats } para ir directo a estadísticas).",
  },
  {
    nombre: "TiempoInactividadMin",
    descripcion:
      "RiogasTracking: minutos de inactividad antes de expirar la sesión (override por usuario > rol).",
  },
  {
    nombre: "EmpFletera",
    descripcion:
      "RiogasTracking: empresa(s) fletera(s) del usuario (ej. { TODAS: * }). Requerido para login de supervisor.",
  },
  {
    nombre: "Escenario",
    descripcion: "RiogasTracking: escenario/zonificación activo (ej. { MONTEVIDEO: 1000 }).",
  },
  {
    nombre: "HistoricoMaxPedidos",
    descripcion:
      "RiogasTracking: antigüedad máxima (días) de pedidos consultables en histórico (ej. { CantDiasMaxAntiguedad: 60 }).",
  },
  {
    nombre: "HistoricoMaxCoords",
    descripcion:
      "RiogasTracking: antigüedad máxima (días) de coordenadas consultables en histórico (ej. { CantDiasMaxAntiguedad: 31 }).",
  },
];

/** Solo los nombres, para mergear con las sugerencias derivadas de la BD. */
export const NOMBRES_ATRIBUTOS_CONOCIDOS: string[] = ATRIBUTOS_CONOCIDOS.map(
  (a) => a.nombre,
);
