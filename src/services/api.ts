import { api, overpassApi } from "@/lib/axios";
import {
  withApiLogging,
  setSentryUser,
  clearSentryUser,
} from "@/lib/sentryHelpers";

// Tipos globales
export type Role = "admin" | "user" | "root";

export interface User {
  name: string;
  email: string;
  role: Role;
  token: string;
}

export interface MenuItem {
  label: string;
  icon: string;
  path: string;
}

// ✅ Función de login (mockeada por ahora)
export const apiLogin = async (
  email: string,
  password: string,
): Promise<{ data: { success: boolean; user: User } }> => {
  return withApiLogging(
    "/auth/login",
    async () => {
      // TODO: Descomentá esto cuando tengas backend
      // return api.post("/auth/login", { email, password });

      // Mock temporal
      const result = await new Promise<{
        data: { success: boolean; user: User };
      }>((resolve) =>
        setTimeout(() => {
          const user = {
            name: "Julio Gómez",
            email: "julio.gomez@riogas.com.uy",
            role: "admin" as Role, // Cambiar a "user" si querés simular otro perfil
            token: "fake-jwt-token-12345",
          };

          // Configurar usuario en Sentry después del login exitoso
          setSentryUser({
            id: user.email,
            email: user.email,
            name: user.name,
            role: user.role,
          });

          resolve({
            data: {
              success: true,
              user,
            },
          });
        }, 1000),
      );

      return result;
    },
    "POST",
    { email, password: "[HIDDEN]" }, // No loggear la contraseña real
  );
};

// ✅ Menú real: siempre envía { AplicacionId: "SecuritySuite" }
export const apiMenu = async () => {
  const App_ID = process.env.NEXT_PUBLIC_APLICACION_ID || 1; // Usar variable de entorno o valor por defecto
  try {
    const response = await api.post(
      "/Menu",
      { AplicacionId: App_ID },
      {
        headers: { "Content-Type": "application/json" },
        withCredentials: true,
      },
    );
    return response.data;
  } catch (error: any) {
    console.error(
      "Error al obtener el menú:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

// ✅ Función para crear usuario
export const apiCreateUser = async (body: any) => {
  try {
    const response = await api.post("/createUser", body, {
      headers: { "Content-Type": "application/json" },
    });
    return response.data;
  } catch (error: any) {
    console.error(
      "Error al crear usuario:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

// ✅ Login real contra backend externo
export const apiLoginUser = async (body: {
  UserName: string;
  Password: string;
  Sistema: string;
}) => {
  try {
    const response = await api.post("/loginUser", body, {
      headers: { "Content-Type": "application/json" },
      withCredentials: true,
    });
    // Guardar token en cookie
    if (response.data?.token) {
      document.cookie = `token=${response.data.token}; path=/; max-age=${60 * 60 * 24 * 7}`;
    }
    // Guardar usuario en localStorage
    if (response.data?.user) {
      localStorage.setItem(
        "user",
        JSON.stringify({
          nombre: response.data.user.nombre,
          email: response.data.user.email,
          username: response.data.user.username,
          id: response.data.user.id,
          isRoot: response.data.user.isRoot,
        }),
      );
    }
    return response.data;
  } catch (error: any) {
    console.error(
      "Error al iniciar sesión:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

// =====================
// ✅ Validación de permisos (POST /Permisos)
// Body requerido:
// { AplicacionId, ObjetoKey, ObjetoTipo, AccionKey, ObjetoPath? }
// Nota: ObjetoPath se deriva de la URL actual si no se provee, quitando el prefijo /dashboard
// =====================

export type ValidarPermisoReq = {
  AplicacionId: string | number;
  ObjetoKey: string; // ej: "page.dashboard.usuarios.add"
  ObjetoTipo: "MENU" | "PAGE" | "FEATURE" | string;
  AccionKey:
    | "view"
    | "execute"
    | "create"
    | "update"
    | "delete"
    | "export"
    | string;
  ObjetoPath?: string; // ej: "/usuarios/editar/123" (sin "/dashboard")
};

export type ValidarPermisoResp = {
  permitido: boolean;
  redirect?: string;
  reason?: string;
  [k: string]: unknown;
};

function deriveObjetoPath(input?: string): string | undefined {
  if (input && typeof input === "string") return input;
  try {
    if (typeof window !== "undefined") {
      const full = window.location?.pathname || "";
      if (!full) return undefined;
      const prefix = "/dashboard";
      return full.startsWith(prefix) ? full.slice(prefix.length) || "/" : full;
    }
  } catch {}
  return undefined;
}

export const apiValidarPermiso = async (
  payload: ValidarPermisoReq,
  opts?: { signal?: AbortSignal },
): Promise<ValidarPermisoResp> => {
  try {
    const body = {
      ...payload,
      ObjetoPath: deriveObjetoPath(payload.ObjetoPath),
    } as Record<string, unknown>;

    const res = await api.post(
      "/Permisos", // ⬅️ endpoint solicitado
      body, // ⬅️ { AplicacionId, ObjetoKey, ObjetoTipo, AccionKey, ObjetoPath }
      { signal: opts?.signal, withCredentials: true },
    );

    const permitido =
      (res.data as any)?.permitido === true ||
      (res.data as any)?.ok === true ||
      (res.data as any)?.success === true;

    return {
      permitido,
      redirect: (res.data as any)?.redirect,
      reason: (res.data as any)?.reason,
      ...(res.data as any),
    } as ValidarPermisoResp;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      try {
        clearSentryUser();
      } catch {}
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie = "token=; path=/; max-age=0";
        }
      } catch {}
      const e = new Error("UNAUTHORIZED");
      (e as any).status = 401;
      throw e;
    }

    if (status === 403) {
      return {
        permitido: false,
        reason: error?.response?.data?.reason || "FORBIDDEN",
      } as ValidarPermisoResp;
    }

    throw error;
  }
};

// =====================
// ✅ Servicio: Listado de usuarios (POST /usuarios)
// Mismo formato que apiValidarPermiso, sin tipos adicionales
// =====================
export const apiUsuarios = async (
  payload: any,
  opts?: { signal?: AbortSignal },
) => {
  try {
    const res = await api.post("/usuarios", payload, {
      signal: opts?.signal,
      withCredentials: true,
    });
    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      try {
        clearSentryUser();
      } catch {}
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie = "token=; path=/; max-age=0";
        }
      } catch {}
      const e = new Error("UNAUTHORIZED");
      (e as any).status = 401;
      throw e;
    }

    if (status === 403) {
      return error?.response?.data || { reason: "FORBIDDEN" };
    }

    throw error;
  }
};

// =====================
// ✅ Servicio: Listado de aplicaciones (POST /aplicaciones)
// Mismo formato que apiValidarPermiso, sin tipos adicionales
// =====================
export const apiAplicaciones = async (
  payload: any,
  opts?: { signal?: AbortSignal },
) => {
  try {
    const res = await api.post("/aplicaciones", payload, {
      signal: opts?.signal,
      withCredentials: true,
    });
    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      try {
        clearSentryUser();
      } catch {}
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie = "token=; path=/; max-age=0";
        }
      } catch {}
      const e = new Error("UNAUTHORIZED");
      (e as any).status = 401;
      throw e;
    }

    if (status === 403) {
      return error?.response?.data || { reason: "FORBIDDEN" };
    }

    throw error;
  }
};

// =====================
// ✅ Servicio: Listado de roles (POST /roles)
// Mismo formato que apiValidarPermiso, sin tipos adicionales
// =====================
export const apiRoles = async (
  payload: any,
  opts?: { signal?: AbortSignal },
) => {
  try {
    const res = await api.post("/roles", payload, {
      signal: opts?.signal,
      withCredentials: true,
    });
    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      try {
        clearSentryUser();
      } catch {}
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie = "token=; path=/; max-age=0";
        }
      } catch {}
      const e = new Error("UNAUTHORIZED");
      (e as any).status = 401;
      throw e;
    }

    if (status === 403) {
      return error?.response?.data || { reason: "FORBIDDEN" };
    }

    throw error;
  }
};

// =====================
// ✅ Servicio: Listado de objetos (POST /objetos)
// Mismo formato que apiValidarPermiso, sin tipos adicionales
// =====================
export const apiObjetos = async (
  payload: any,
  opts?: { signal?: AbortSignal },
) => {
  try {
    const res = await api.post("/objetos", payload, {
      signal: opts?.signal,
      withCredentials: true,
    });
    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      try {
        clearSentryUser();
      } catch {}
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie = "token=; path=/; max-age=0";
        }
      } catch {}
      const e = new Error("UNAUTHORIZED");
      (e as any).status = 401;
      throw e;
    }

    if (status === 403) {
      return error?.response?.data || { reason: "FORBIDDEN" };
    }

    throw error;
  }
};

// =====================
// ✅ Servicio: Listado de eventos (POST /eventos)
// Mismo formato que apiValidarPermiso, sin tipos adicionales
// =====================
export const apiEventos = async (
  payload: any,
  opts?: { signal?: AbortSignal },
) => {
  try {
    const res = await api.post("/eventos", payload, {
      signal: opts?.signal,
      withCredentials: true,
    });
    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      try {
        clearSentryUser();
      } catch {}
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie = "token=; path=/; max-age=0";
        }
      } catch {}
      const e = new Error("UNAUTHORIZED");
      (e as any).status = 401;
      throw e;
    }

    if (status === 403) {
      return error?.response?.data || { reason: "FORBIDDEN" };
    }

    throw error;
  }
};

// =====================
// ✅ Servicio: Listado de permisos (POST /permisos)
// Mismo formato que apiValidarPermiso, sin tipos adicionales
// =====================
export const apiPermisos = async (
  payload: any,
  opts?: { signal?: AbortSignal },
) => {
  try {
    const res = await api.post("/accesos", payload, {
      signal: opts?.signal,
      withCredentials: true,
    });
    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      try {
        clearSentryUser();
      } catch {}
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie = "token=; path=/; max-age=0";
        }
      } catch {}
      const e = new Error("UNAUTHORIZED");
      (e as any).status = 401;
      throw e;
    }

    if (status === 403) {
      return error?.response?.data || { reason: "FORBIDDEN" };
    }

    throw error;
  }
};

// =====================
// ✅ Servicio: ABM de objetos (POST /abmObjetos)
// Envía el payload con la estructura requerida por el backend
// =====================
export const apiAbmObjetos = async (
  payload: any,
  opts?: { signal?: AbortSignal },
) => {
  try {
    const res = await api.post("/abmObjetos", payload, {
      signal: opts?.signal,
      withCredentials: true,
    });
    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      try {
        clearSentryUser();
      } catch {}
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie = "token=; path=/; max-age=0";
        }
      } catch {}
      const e = new Error("UNAUTHORIZED");
      (e as any).status = 401;
      throw e;
    }

    if (status === 403) {
      return error?.response?.data || { reason: "FORBIDDEN" };
    }

    throw error;
  }
};

// =====================
// ✅ Servicio: Listar objetos relacionados (POST /listarObjetos)
// Body: { AplicacionId, sinMenu=false, Page=1, PageSize=20, Search?, Tipo?, Estado? }
// Respuesta esperada: { sdtListaObjetos: Array<...> }
// =====================
export type ListarObjetosReq = {
  AplicacionId: number | string;
  Page?: number;
  PageSize?: number;
  Search?: string;
  Tipo?: string;
  Estado?: string;
  sinMenu?: boolean; // ⬅️ nuevo: si true, el backend excluye objetos de tipo MENU
};

export type ListarObjetosAccion = {
  AccionCodigo: string;
  AccionCreadoEn: string;
  AccionDescripcion: string;
  AccionIcon: string;
  AccionId: number;
  AccionKey: string;
  AccionLabel: string;
  AccionPath: string;
  AccionRelacion: string;
};

export type ListarObjetosItem = {
  Acciones: ListarObjetosAccion[];
  AplicacionId: string;
  ObjetoCreadoEn: string;
  ObjetoEsPublico: string; // "S" | "N"
  ObjetoEstado: string; // "A" | "I"
  ObjetoId: number;
  ObjetoKey: string;
  ObjetoParentId: number;
  ObjetoTipo: string; // "MENU" | "SUBMENU" | "PAGE" | "FEATURE"
};

export type ListarObjetosResp = {
  sdtListaObjetos: ListarObjetosItem[];
  page?: number;
  pageSize?: number;
  total?: number;
  [k: string]: unknown;
};

export const apiListarObjetos = async (
  payload: ListarObjetosReq,
  opts?: { signal?: AbortSignal },
): Promise<ListarObjetosResp> => {
  try {
    const body = {
      AplicacionId: payload.AplicacionId,
      sinMenu: payload.sinMenu === true ? true : false,
    };

    const res = await api.post("/listarObjetos", body, {
      signal: opts?.signal,
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
    });
    return res.data as ListarObjetosResp;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      try {
        clearSentryUser();
      } catch {}
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie = "token=; path=/; max-age=0";
        }
      } catch {}
      const e = new Error("UNAUTHORIZED");
      (e as any).status = 401;
      throw e;
    }

    if (status === 403) {
      return (error?.response?.data || {
        reason: "FORBIDDEN",
      }) as ListarObjetosResp;
    }

    throw error;
  }
};

// ✅ Servicio: ABM Funcionalidades (POST /abmFuncionalidades)
// =====================
export type AbmFuncionalidadesAccion = {
  ObjetoId: number;
  AccionId: number;
};

export type AbmFuncionalidadesReq = {
  FuncionalidadId: number;
  AplicacionId: number;
  FuncionalidadNombre: string;
  FuncionalidadEstado: string;
  FuncionalidadFchIns: string;
  FuncionalidadEsPublico: string;
  FuncionalidadSoloRoot: string;
  FuncionalidadFchDesde: string;
  FuncionalidadFchHasta: string;
  Accion: AbmFuncionalidadesAccion[];
};

export type AbmFuncionalidadesResp = {
  success: boolean;
  message?: string;
  FuncionalidadId?: number;
  [k: string]: unknown;
};

export const apiAbmFuncionalidades = async (
  payload: AbmFuncionalidadesReq,
  opts?: { signal?: AbortSignal },
): Promise<AbmFuncionalidadesResp> => {
  try {
    const res = await api.post("/abmFuncionalidades", payload, {
      signal: opts?.signal,
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
    });

    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      // Limpiar tokens en caso de unauthorized
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie = "token=; path=/; max-age=0";
        }
      } catch {}
      const e = new Error("UNAUTHORIZED");
      (e as any).status = 401;
      throw e;
    }

    if (status === 403) {
      return (error?.response?.data || {
        reason: "FORBIDDEN",
      }) as AbmFuncionalidadesResp;
    }

    throw error;
  }
};

// ✅ Servicio: Listar Funcionalidades (POST /listarFuncionalidades)
// Body: { AplicacionId }
// Respuesta esperada: { sdtFuncionalidades: Array<...> }
// =====================
export type ListarFuncionalidadesReq = {
  AplicacionId: number;
};

export type ListarFuncionalidadesAccion = {
  AccionId: number;
  ObjetoId: number;
};

export type ListarFuncionalidadesItem = {
  Accion: ListarFuncionalidadesAccion[];
  AplicacionId: string;
  FuncionalidadEsPublico: string; // "S" | "N"
  FuncionalidadEstado: string; // "A" | "I"
  FuncionalidadFchDesde: string;
  FuncionalidadFchHasta: string;
  FuncionalidadFchIns: string;
  FuncionalidadId: number;
  FuncionalidadNombre: string;
  FuncionalidadSoloRoot: string; // "S" | "N"
};

export type ListarFuncionalidadesResp = {
  sdtFuncionalidades: ListarFuncionalidadesItem[];
  [k: string]: unknown;
};

export const apiListarFuncionalidades = async (
  payload: ListarFuncionalidadesReq,
  opts?: { signal?: AbortSignal },
): Promise<ListarFuncionalidadesResp> => {
  try {
    const res = await api.post("/listarFuncionalidades", payload, {
      signal: opts?.signal,
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
    });

    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      // Limpiar tokens en caso de unauthorized
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie = "token=; path=/; max-age=0";
        }
      } catch {}
      const e = new Error("UNAUTHORIZED");
      (e as any).status = 401;
      throw e;
    }

    if (status === 403) {
      return (error?.response?.data || {
        reason: "FORBIDDEN",
      }) as ListarFuncionalidadesResp;
    }

    throw error;
  }
};

// ✅ Servicio: ABM Roles (POST /abmRoles)
// =====================
export type AbmRolesFuncionalidad = {
  FuncionalidadId: number;
  RolFuncionalidadFchIns: string;
};

export type AbmRolesReq = {
  RolId: number;
  AplicacionId: number;
  RolNombre: string;
  RolDescripcion: string;
  RolEstado: string;
  RolNivel: number;
  RolFchIns: string;
  RolCreadoEn: string;
  Funcionalidad: AbmRolesFuncionalidad[];
};

export type AbmRolesResp = {
  success: boolean;
  message?: string;
  RolId?: number;
  [k: string]: unknown;
};

/* Duplicate apiObtenerRol removed to fix redeclaration error */

export const apiAbmRoles = async (
  payload: AbmRolesReq,
  opts?: { signal?: AbortSignal },
): Promise<AbmRolesResp> => {
  try {
    const res = await api.post("/abmRoles", payload, {
      signal: opts?.signal,
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
    });

    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      // Limpiar tokens en caso de unauthorized
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie =
            "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        }
      } catch (cleanupError) {
        console.warn("Error during token cleanup:", cleanupError);
      }

      // Redirigir al login
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }

    if (status === 403) {
      return (error?.response?.data || { reason: "FORBIDDEN" }) as AbmRolesResp;
    }

    throw error;
  }
};

// =====================
// ✅ Servicio: Obtener datos de un rol específico (POST /obtenerRol)
// Body: { RolId: number }
// Respuesta: { sdtRol: RolData }
// =====================
export type ObtenerRolReq = {
  RolId: number;
};

export type RolFuncionalidad = {
  FuncionalidadId: number;
  RolFuncionalidadFchIns: string;
};

export type ObtenerRolResp = {
  AplicacionId: string;
  Funcionalidad: RolFuncionalidad[];
  RolCreadoEn: string;
  RolDescripcion: string;
  RolEstado: string;
  RolFchIns: string;
  RolId: string;
  RolNivel: string;
  RolNombre: string;
};

export const apiObtenerRol = async (
  payload: ObtenerRolReq,
  opts?: { signal?: AbortSignal },
): Promise<ObtenerRolResp> => {
  try {
    const res = await api.post("/obtenerRol", payload, {
      signal: opts?.signal,
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
    });

    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      try {
        clearSentryUser();
      } catch {}
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie = "token=; path=/; max-age=0";
        }
      } catch {}
      const e = new Error("UNAUTHORIZED");
      (e as any).status = 401;
      throw e;
    }

    if (status === 403) {
      return (error?.response?.data || {
        reason: "FORBIDDEN",
      }) as ObtenerRolResp;
    }

    throw error;
  }
};

// ✅ Servicio: Importar Usuario (POST /importarUsuario)
// =====================
export type ImportarUsuarioReq = {
  UserExtendedId: number;
  AplicacionId?: number;
};

export type ImportarUsuarioResp = {
  success: boolean;
  message?: string;
  UsuarioId?: number;
  [k: string]: unknown;
};

export const apiImportarUsuario = async (
  payload: ImportarUsuarioReq,
  opts?: { signal?: AbortSignal },
): Promise<ImportarUsuarioResp> => {
  try {
    const res = await api.post("/importarUsuario", payload, {
      signal: opts?.signal,
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
    });

    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      // Limpiar tokens en caso de unauthorized
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie =
            "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        }
      } catch (cleanupError) {
        console.warn("Error during token cleanup:", cleanupError);
      }

      // Redirigir al login
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }

    if (status === 403) {
      return (error?.response?.data || {
        reason: "FORBIDDEN",
      }) as ImportarUsuarioResp;
    }

    throw error;
  }
};

// =====================
// ✅ Servicio: Asignar roles a usuario (POST /setRol)
// Body: { UserId: number, sdtAsignacionRoles: [{ RolId, UsuarioRolFchDesde, UsuarioRolFchHasta }] }
// =====================
export type AsignacionRol = {
  RolId: number;
  UsuarioRolFchDesde: string; // ISO date string
  UsuarioRolFchHasta: string; // ISO date string
};

export type SetRolReq = {
  UserId: number;
  sdtAsignacionRoles: AsignacionRol[];
};

export type SetRolResp = {
  success: boolean;
  message?: string;
  [k: string]: unknown;
};

// Tipos para Atributos de Usuario
export interface UserPreference {
  UserPreferenceId: number;
  UserExtendedId: number;
  UserPreferenceAtributo: string;
  UserPreferenceValor: string;
}

export type GetAtributosResp = UserPreference[];

export type ABMAtributosReq = {
  sdtAtributos: UserPreference[];
  UserId: number;
};

export type ABMAtributosResp = {
  success: boolean;
  message?: string;
  [k: string]: unknown;
};

export const apiSetRol = async (
  payload: SetRolReq,
  opts?: { signal?: AbortSignal },
): Promise<SetRolResp> => {
  try {
    const res = await api.post("/setRol", payload, {
      signal: opts?.signal,
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
    });

    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      try {
        clearSentryUser();
      } catch {}
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie = "token=; path=/; max-age=0";
        }
      } catch {}
      const e = new Error("UNAUTHORIZED");
      (e as any).status = 401;
      throw e;
    }

    if (status === 403) {
      return (error?.response?.data || { reason: "FORBIDDEN" }) as SetRolResp;
    }

    throw error;
  }
};

// =====================
// ✅ Servicio: Obtener roles asignados al usuario (POST /getRoles)
// Body: {} (vacío)
// Respuesta: Array de roles asignados al usuario actual
// =====================
export type RolAsignado = {
  RolId: number;
  RolNombre: string;
  RolDescripcion: string;
  RolEstado: string;
  RolNivel: number;
  RolFchIns: string;
  AplicacionId: number;
  RolCreadoEn: string;
  AplicacionNombre: string;
  esRoot: string;
};

export const apiGetRoles = async (opts?: {
  signal?: AbortSignal;
}): Promise<RolAsignado[]> => {
  try {
    const res = await api.post(
      "/getRoles",
      {},
      {
        signal: opts?.signal,
        withCredentials: true,
        headers: { "Content-Type": "application/json" },
      },
    );

    return res.data || [];
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      try {
        clearSentryUser();
      } catch {}
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie = "token=; path=/; max-age=0";
        }
      } catch {}
      const e = new Error("UNAUTHORIZED");
      (e as any).status = 401;
      throw e;
    }

    if (status === 403) {
      return [];
    }

    throw error;
  }
};

// =====================
// ✅ Servicio: Obtener roles asignados a un usuario específico (POST /getRolUsuario)
// Body: { UserId: number }
// Respuesta: Array de roles asignados al usuario especificado
// =====================
export type GetRolUsuarioReq = {
  UserId: number;
};

export const apiGetRolUsuario = async (
  req: GetRolUsuarioReq,
  opts?: { signal?: AbortSignal },
): Promise<RolAsignado[]> => {
  try {
    const res = await api.post("/getRolUsuario", req, {
      signal: opts?.signal,
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
    });

    return res.data || [];
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
      try {
        clearSentryUser();
      } catch {}
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        if (typeof document !== "undefined") {
          document.cookie = "token=; path=/; max-age=0";
        }
      } catch {}
      const e = new Error("UNAUTHORIZED");
      (e as any).status = 401;
      throw e;
    }

    if (status === 403) {
      return [];
    }

    throw error;
  }
};
// =====================
// âœ… Servicio: Obtener atributos del usuario (POST /getAtributos)
// Body: { UserId: number }
// Respuesta: Array de atributos del usuario especificado
// =====================
export const apiGetAtributos = async (
  userId: number,
  opts?: {
    signal?: AbortSignal;
  },
): Promise<GetAtributosResp> => {
  return withApiLogging("/getAtributos", async () => {
    try {
      const res = await api.post(
        "/getAtributos",
        { UserId: userId },
        {
          signal: opts?.signal,
          withCredentials: true,
          headers: { "Content-Type": "application/json" },
        },
      );

      // La API devuelve {"sdtAtributos": [...]}
      return res.data?.sdtAtributos || [];
    } catch (error: any) {
      const status = error?.response?.status;

      if (status === 401) {
        try {
          clearSentryUser();
        } catch {}
        try {
          if (typeof window !== "undefined") {
            localStorage.removeItem("user");
            localStorage.removeItem("token");
          }
          if (typeof document !== "undefined") {
            document.cookie = "token=; path=/; max-age=0";
          }
        } catch {}
        const e = new Error("UNAUTHORIZED");
        (e as any).status = 401;
        throw e;
      }

      if (status === 403) {
        return [];
      }

      throw error;
    }
  });
};

// =====================
// âœ… Servicio: Guardar/Editar atributos del usuario (POST /ABMAtributos)
// Body: Array de UserPreference
// Respuesta: ConfirmaciÃ³n de Ã©xito
// =====================
export const apiABMAtributos = async (
  payload: ABMAtributosReq,
  opts?: { signal?: AbortSignal },
): Promise<ABMAtributosResp> => {
  return withApiLogging("/ABMAtributos", async () => {
    try {
      const res = await api.post("/ABMAtributos", payload, {
        signal: opts?.signal,
        withCredentials: true,
        headers: { "Content-Type": "application/json" },
      });

      return res.data;
    } catch (error: any) {
      const status = error?.response?.status;

      if (status === 401) {
        try {
          clearSentryUser();
        } catch {}
        try {
          if (typeof window !== "undefined") {
            localStorage.removeItem("user");
            localStorage.removeItem("token");
          }
          if (typeof document !== "undefined") {
            document.cookie = "token=; path=/; max-age=0";
          }
        } catch {}
        const e = new Error("UNAUTHORIZED");
        (e as any).status = 401;
        throw e;
      }

      if (status === 403) {
        return { success: false, message: "FORBIDDEN" };
      }

      throw error;
    }
  });
};
