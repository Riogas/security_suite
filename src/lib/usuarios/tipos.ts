// Tipos compartidos del cruce entre los orígenes externos (AS400 / AD) y la
// tabla `usuarios` de PostgreSQL.

export type OrigenExterno = "SGM" | "LDAP" | "GSIST";

export type EstadoComparacion = "NUEVO" | "MIGRADO" | "DIFIERE" | "CONFLICTO";

/** Un usuario tal como lo devuelve una fuente externa, ya normalizado. */
export interface ExternalUser {
  origen: OrigenExterno;
  /** Username tal cual viene del origen (puede estar en MAYÚSCULAS). */
  username: string;
  nombre: string | null;
  email: string | null;
  habilitado: boolean;
  esCuentaSistema: boolean;
  extras: {
    escenarioId?: number | null;
    escenarioNom?: string | null;
    empFleteraId?: number | null;
    empFleteraNom?: string | null;
    /** GRPIDs de ADMSEC.GRPUSU. */
    grupos?: number[];
    /** ROLIDs de GXICAGEO.USUMOBILEROLES. */
    rolesSgm?: number[];
    usuAutAd?: "A" | "G";
    /** ADMSEC.USUARIOS.USUID. */
    usuId?: number | null;
    /**
     * USUDTUPD ya formateada como 'YYYY-MM-DD HH:MM:SS.ffffff'. String A
     * PROPÓSITO: compararla contra un Date da false siempre, así que se
     * compara como texto contra la marca de la última corrida.
     */
    dtUpd?: string | null;
  };
}

/** Lo mínimo que hace falta traer de PG para comparar. */
export interface UsuarioLocalMinimo {
  id: number;
  username: string;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
  estado: string;
  desdeSistema: string | null;
}

export interface DiferenciaCampo {
  campo: "nombre" | "email" | "estado";
  local: string | null;
  externo: string | null;
}

export interface ExternalUserComparado extends ExternalUser {
  estadoComparacion: EstadoComparacion;
  /** Id del usuario local que matcheó, si hubo match por username. */
  usuarioLocalId: number | null;
  /** Solo cuando estadoComparacion === "DIFIERE". */
  diffs: DiferenciaCampo[];
  /** Solo cuando estadoComparacion === "CONFLICTO": quién tiene ese email. */
  conflictoCon: string | null;
  /** Si viene tildado por defecto en la grilla del paso 2. */
  preseleccionado: boolean;
}

export interface ResumenComparacion {
  nuevos: number;
  migrados: number;
  difieren: number;
  conflictos: number;
  /**
   * Cuántos vienen tildados por defecto. NO es igual a `nuevos`: las cuentas
   * de sistema son NUEVO pero arrancan destildadas. Sin este contador, el
   * botón de la UI diría "Importar 429" y se importarían 425.
   */
  preseleccionados: number;
}
