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

// ✅ Menú real: siempre envía { AplicacionId } desde env (default: 1)
export const apiMenu = async () => {
  const App_ID = Number(process.env.NEXT_PUBLIC_APLICACION_ID) || 1;
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
// Helper: busca una propiedad case-insensitive en un objeto
function getCI<T = any>(obj: any, key: string): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  // Prueba exacta primero, luego lowercase
  if (key in obj) return obj[key];
  const lower = key.toLowerCase();
  const found = Object.keys(obj).find((k) => k.toLowerCase() === lower);
  return found ? obj[found] : undefined;
}

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

    const data = response.data;

    // Buscar token case-insensitive (GeneXus puede devolver Token, token, TOKEN, etc.)
    const token = getCI<string>(data, "token");
    // Guardar token en cookie
    if (token) {
      document.cookie = `token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
      // Backup en localStorage
      localStorage.setItem("token", token);
      console.log("📥[Login] Token guardado en cookie y localStorage");
    } else {
      console.warn("📥[Login] ⚠️ No se encontró token en la respuesta:", Object.keys(data));
    }

    // Buscar usuario case-insensitive
    const user = getCI<any>(data, "user");
    if (user) {
      localStorage.setItem(
        "user",
        JSON.stringify({
          nombre: getCI(user, "nombre") ?? getCI(user, "name") ?? "",
          email: getCI(user, "email") ?? "",
          username: getCI(user, "username") ?? getCI(user, "userName") ?? "",
          id: getCI(user, "id") ?? "",
          isRoot: getCI(user, "isRoot") ?? getCI(user, "isroot") ?? "N",
        }),
      );
    }

    // Normalizar la respuesta para que siempre tenga las keys en minúscula
    return {
      ...data,
      success: getCI(data, "success") ?? true,
      token: token,
      user: user ? {
        nombre: getCI(user, "nombre") ?? getCI(user, "name") ?? "",
        email: getCI(user, "email") ?? "",
        username: getCI(user, "username") ?? getCI(user, "userName") ?? "",
        id: getCI(user, "id") ?? "",
        isRoot: getCI(user, "isRoot") ?? getCI(user, "isroot") ?? "N",
      } : data.user,
    };
  } catch (error: any) {
    console.error(
      "Error al iniciar sesión:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

// =====================
// ✅ Validación de permisos — usa endpoint interno PostgreSQL (/api/db/permisos)
// Body requerido:
// { AplicacionId, ObjetoKey, ObjetoTipo, AccionKey, ObjetoPath? }
// =====================

export type ValidarPermisoReq = {
  AplicacionId: string | number;
  ObjetoKey: string; // ej: "estadistica"
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

/** Lee el JWT desde cookie o localStorage — igual que el interceptor de axios */
function getAuthToken(): string | null {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|; )token=([^;]*)/);
    if (match?.[1]) return match[1];
  }
  if (typeof window !== "undefined") {
    const ls = localStorage.getItem("token");
    if (ls) return ls;
  }
  return null;
}

export const apiValidarPermiso = async (
  payload: ValidarPermisoReq,
  opts?: { signal?: AbortSignal },
): Promise<ValidarPermisoResp> => {
  try {
    const body = {
      ...payload,
      ObjetoPath: deriveObjetoPath(payload.ObjetoPath),
    };

    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch("/api/db/permisos", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: opts?.signal,
      credentials: "include", // envía también la cookie token como fallback
    });

    const data = await res.json();

    if (res.status === 401) {
      try { clearSentryUser(); } catch {}
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

    const permitido =
      data?.Permitido === true ||
      data?.permitido === true ||
      data?.allowed === true ||
      data?.ok === true;

    return {
      permitido,
      redirect: data?.redirect,
      reason: data?.reason,
      ...data,
    } as ValidarPermisoResp;
  } catch (error: any) {
    if (error?.message === "UNAUTHORIZED") throw error;
    // En caso de error de red → denegar conservadoramente
    return { permitido: false, reason: "FETCH_ERROR" } as ValidarPermisoResp;
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

// =====================================================================
// 📦 SERVICIOS PRISMA (PostgreSQL) - Usuarios locales/migrados
// =====================================================================

// Tipos para usuarios PostgreSQL
export interface UsuarioDB {
  id: number;
  username: string;
  email: string | null;
  nombre: string | null;
  apellido: string | null;
  estado: string;
  fechaCreacion: string;
  fechaBaja: string | null;
  fechaUltimoLogin: string | null;
  esExterno: string;
  usuarioExterno: string | null;
  tipoUsuario: string;
  modificaPermisos: string;
  cambioPassword: string;
  intentosFallidos: number;
  fechaUltimoBloqueo: string | null;
  telefono: string | null;
  creadoPor: string | null;
  desdeSistema: string;
  esRoot: string;
  fechaUltimoPermiso: string | null;
  observacion: string | null;
  observacion2: string | null;
}

export interface UsuariosDBResponse {
  success: boolean;
  items: UsuarioDB[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ✅ Listar usuarios locales desde PostgreSQL
export const apiUsuariosDB = async (
  opts: {
    filtro?: string;
    estado?: string;
    page?: number;
    pageSize?: number;
    signal?: AbortSignal;
  } = {},
): Promise<UsuariosDBResponse> => {
  const params = new URLSearchParams();
  if (opts.filtro) params.set("filtro", opts.filtro);
  if (opts.estado) params.set("estado", opts.estado);
  if (opts.page) params.set("page", String(opts.page));
  if (opts.pageSize) params.set("pageSize", String(opts.pageSize));

  const res = await fetch(`/api/db/usuarios?${params.toString()}`, {
    signal: opts.signal,
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }

  return res.json();
};

// ✅ Obtener un usuario por ID desde PostgreSQL
export const apiUsuarioDBById = async (
  id: number,
  opts?: { signal?: AbortSignal },
): Promise<{ success: boolean; usuario: UsuarioDB & { roles?: any[]; preferencias?: any[] } }> => {
  const res = await fetch(`/api/db/usuarios/${id}`, {
    signal: opts?.signal,
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }

  return res.json();
};

// ✅ Crear usuario en PostgreSQL
export const apiCrearUsuarioDB = async (
  data: {
    username: string;
    password: string;
    email?: string;
    nombre?: string;
    apellido?: string;
    estado?: string;
    telefono?: string;
    tipoUsuario?: string;
    esExterno?: string;
    usuarioExterno?: string;
    esRoot?: string;
    desdeSistema?: string;
    creadoPor?: string;
  },
): Promise<{ success: boolean; usuario?: UsuarioDB; error?: string }> => {
  const res = await fetch("/api/db/usuarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `Error ${res.status}`);
  }

  return json;
};

// ✅ Actualizar usuario en PostgreSQL
export const apiActualizarUsuarioDB = async (
  id: number,
  data: Partial<Omit<UsuarioDB, "id" | "fechaCreacion">>,
): Promise<{ success: boolean; usuario?: UsuarioDB; error?: string }> => {
  const res = await fetch(`/api/db/usuarios/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `Error ${res.status}`);
  }

  return json;
};

// ✅ Eliminar (desactivar) usuario en PostgreSQL
export const apiEliminarUsuarioDB = async (
  id: number,
): Promise<{ success: boolean; message?: string; error?: string }> => {
  const res = await fetch(`/api/db/usuarios/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `Error ${res.status}`);
  }

  return json;
};

// =====================================================================
// 📦 SERVICIOS PRISMA — Aplicaciones
// =====================================================================

export interface AplicacionDB {
  id: number;
  nombre: string;
  descripcion: string | null;
  estado: string;
  url: string | null;
  tecnologia: string | null;
  fechaCreacion: string;
  sistemaId: number | null;
}

export interface AplicacionesDBResponse {
  success: boolean;
  items: AplicacionDB[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

async function dbFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}

export const apiAplicacionesDB = async (opts?: {
  filtro?: string;
  estado?: string;
  page?: number;
  pageSize?: number;
}): Promise<AplicacionesDBResponse> => {
  const params = new URLSearchParams();
  if (opts?.filtro) params.set("filtro", opts.filtro);
  if (opts?.estado) params.set("estado", opts.estado);
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.pageSize) params.set("pageSize", String(opts.pageSize));
  return dbFetch(`/api/db/aplicaciones?${params}`);
};

export const apiAplicacionDBById = async (id: number) =>
  dbFetch(`/api/db/aplicaciones/${id}`);

export const apiCrearAplicacionDB = async (data: Partial<AplicacionDB>) =>
  dbFetch("/api/db/aplicaciones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const apiActualizarAplicacionDB = async (id: number, data: Partial<AplicacionDB>) =>
  dbFetch(`/api/db/aplicaciones/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const apiEliminarAplicacionDB = async (id: number) =>
  dbFetch(`/api/db/aplicaciones/${id}`, { method: "DELETE" });

// =====================================================================
// 📦 SERVICIOS PRISMA — Objetos
// =====================================================================

export interface ObjetoAccionDB {
  id?: number;
  objetoId?: number;
  key: string;
  descripcion?: string | null;
  codigo?: string | null;
  label?: string | null;
  path?: string | null;
  icon?: string | null;
  relacion?: number | null;
  creadoEn?: string | null;
}

export interface ObjetoDB {
  id?: number;
  aplicacionId: number;
  tipo: string;
  key: string;
  label?: string | null;
  path?: string | null;
  icon?: string | null;
  orden?: number;
  estado?: string;
  esPublico?: string;
  parentId?: number | null;
  creadoEn?: string | null;
  acciones?: ObjetoAccionDB[];
}

export const apiObjetosDB = async (opts?: {
  filtro?: string;
  estado?: string;
  esPublico?: string;
  tipo?: string;
  aplicacionId?: number;
  page?: number;
  pageSize?: number;
}) => {
  const params = new URLSearchParams();
  if (opts?.filtro) params.set("filtro", opts.filtro);
  if (opts?.estado) params.set("estado", opts.estado);
  if (opts?.esPublico) params.set("esPublico", opts.esPublico);
  if (opts?.tipo) params.set("tipo", opts.tipo);
  if (opts?.aplicacionId) params.set("aplicacionId", String(opts.aplicacionId));
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.pageSize) params.set("pageSize", String(opts.pageSize));
  return dbFetch(`/api/db/objetos?${params}`);
};

export const apiObjetoDBById = async (id: number) =>
  dbFetch(`/api/db/objetos/${id}`);

export const apiCrearObjetoDB = async (data: ObjetoDB) =>
  dbFetch("/api/db/objetos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const apiActualizarObjetoDB = async (id: number, data: Partial<ObjetoDB>) =>
  dbFetch(`/api/db/objetos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const apiEliminarObjetoDB = async (id: number) =>
  dbFetch(`/api/db/objetos/${id}`, { method: "DELETE" });

// =====================================================================
// 📦 SERVICIOS PRISMA — Roles
// =====================================================================

export interface RolDB {
  id: number;
  aplicacionId: number;
  nombre: string;
  descripcion: string | null;
  estado: string;
  nivel: number;
  fechaCreacion: string;
  creadoEn: string | null;
  aplicacion?: { id: number; nombre: string };
  funcionalidades?: { funcionalidadId: number; funcionalidad?: { id: number; nombre: string } }[];
}

export interface RolesDBResponse {
  success: boolean;
  items: RolDB[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const apiRolesDB = async (opts?: {
  filtro?: string;
  estado?: string;
  aplicacionId?: number;
  page?: number;
  pageSize?: number;
}): Promise<RolesDBResponse> => {
  const params = new URLSearchParams();
  if (opts?.filtro) params.set("filtro", opts.filtro);
  if (opts?.estado) params.set("estado", opts.estado);
  if (opts?.aplicacionId) params.set("aplicacionId", String(opts.aplicacionId));
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.pageSize) params.set("pageSize", String(opts.pageSize));
  return dbFetch(`/api/db/roles?${params}`);
};

export const apiRolDBById = async (id: number) =>
  dbFetch(`/api/db/roles/${id}`);

export const apiCrearRolDB = async (data: {
  aplicacionId: number;
  nombre: string;
  descripcion?: string;
  estado?: string;
  nivel?: number;
  creadoEn?: string;
  funcionalidades?: { funcionalidadId: number }[];
}) =>
  dbFetch("/api/db/roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const apiActualizarRolDB = async (
  id: number,
  data: {
    nombre?: string;
    descripcion?: string;
    estado?: string;
    nivel?: number;
    creadoEn?: string;
    funcionalidades?: { funcionalidadId: number }[];
  }
) =>
  dbFetch(`/api/db/roles/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const apiEliminarRolDB = async (id: number) =>
  dbFetch(`/api/db/roles/${id}`, { method: "DELETE" });

// Roles de un usuario
export const apiRolesUsuarioDB = async (usuarioId: number) =>
  dbFetch(`/api/db/usuarios/${usuarioId}/roles`);

export const apiAsignarRolesDB = async (
  usuarioId: number,
  roles: { rolId: number; fechaDesde?: string; fechaHasta?: string }[]
) =>
  dbFetch(`/api/db/usuarios/${usuarioId}/roles`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roles }),
  });

// =====================================================================
// 📦 SERVICIOS PRISMA — Funcionalidades
// =====================================================================

export interface FuncionalidadDB {
  id: number;
  aplicacionId: number;
  nombre: string;
  estado: string;
  esPublico: string;
  soloRoot: string;
  objetoKey: string | null;
  accionKey: string | null;
  fechaDesde: string | null;
  fechaHasta: string | null;
  fechaCreacion: string;
  aplicacion?: { id: number; nombre: string };
  acciones?: { accionId: number; accion?: { id: number; nombre: string } }[];
}

export interface FuncionalidadesDBResponse {
  success: boolean;
  items: FuncionalidadDB[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const apiFuncionalidadesDB = async (opts?: {
  filtro?: string;
  estado?: string;
  aplicacionId?: number;
  esPublico?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<FuncionalidadesDBResponse> => {
  const params = new URLSearchParams();
  if (opts?.filtro) params.set("filtro", opts.filtro);
  if (opts?.estado) params.set("estado", opts.estado);
  if (opts?.aplicacionId) params.set("aplicacionId", String(opts.aplicacionId));
  if (opts?.esPublico !== undefined) params.set("esPublico", opts.esPublico ? "S" : "N");
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.pageSize) params.set("pageSize", String(opts.pageSize));
  return dbFetch(`/api/db/funcionalidades?${params}`);
};

export const apiFuncionalidadDBById = async (id: number) =>
  dbFetch(`/api/db/funcionalidades/${id}`);

export const apiCrearFuncionalidadDB = async (data: {
  aplicacionId: number;
  nombre: string;
  estado?: string;
  esPublico?: string;
  soloRoot?: string;
  objetoKey?: string;
  accionKey?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  acciones?: { accionId: number }[];
}) =>
  dbFetch("/api/db/funcionalidades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const apiActualizarFuncionalidadDB = async (
  id: number,
  data: {
    nombre?: string;
    estado?: string;
    esPublico?: string;
    soloRoot?: string;
    objetoKey?: string;
    accionKey?: string;
    fechaDesde?: string;
    fechaHasta?: string;
    acciones?: { accionId: number }[];
  }
) =>
  dbFetch(`/api/db/funcionalidades/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const apiEliminarFuncionalidadDB = async (id: number) =>
  dbFetch(`/api/db/funcionalidades/${id}`, { method: "DELETE" });

// =====================================================================
// 📦 SERVICIOS PRISMA — Atributos (usuario_preferencias)
// =====================================================================

export interface AtributoDB {
  id: number;
  usuarioId: number;
  atributo: string;
  valor: string | null;
}

export const apiAtributosDB = async (usuarioId: number): Promise<AtributoDB[]> => {
  const json = await dbFetch(`/api/db/usuarios/${usuarioId}/atributos`);
  return json.atributos ?? [];
};

export const apiGuardarAtributosDB = async (
  usuarioId: number,
  atributos: { atributo: string; valor?: string }[]
) =>
  dbFetch(`/api/db/usuarios/${usuarioId}/atributos`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ atributos }),
  });

export const apiGuardarAtributoDB = async (
  usuarioId: number,
  atributo: string,
  valor?: string
) =>
  dbFetch(`/api/db/usuarios/${usuarioId}/atributos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ atributo, valor }),
  });

// =====================================================================
// 📦 SERVICIOS PRISMA — Sync masivo desde SGM
// =====================================================================
export interface SyncUsuariosResult {
  success: boolean;
  mensaje: string;
  total: number;
  creados: number;
  actualizados: number;
  errores: number;
  detallesErrores: { username: string; error: string }[];
}

export const apiSyncUsuarios = async (
  payload: { UserName?: string; Desde?: string } = {}
): Promise<SyncUsuariosResult> => {
  const res = await fetch("/api/db/usuarios/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
};

// =====================================================================
// 📦 SERVICIOS PRISMA — Accesos (permisos directos usuario-funcionalidad)
// =====================================================================

export interface AccesoDB {
  funcionalidadId: number;
  usuarioId: number;
  efecto: string;
  creadoEn: string | null;
  fechaDesde: string | null;
  fechaHasta: string | null;
  funcionalidad?: { id: number; nombre: string; aplicacion?: { id: number; nombre: string } };
  usuario?: { id: number; username: string; nombre: string | null; apellido: string | null };
}

export const apiAccesosDB = async (opts: {
  usuarioId?: number;
  aplicacionId?: number;
  funcionalidadId?: number;
}): Promise<AccesoDB[]> => {
  const params = new URLSearchParams();
  if (opts.usuarioId) params.set("usuarioId", String(opts.usuarioId));
  if (opts.aplicacionId) params.set("aplicacionId", String(opts.aplicacionId));
  if (opts.funcionalidadId) params.set("funcionalidadId", String(opts.funcionalidadId));
  const json = await dbFetch(`/api/db/accesos?${params}`);
  return json.accesos ?? [];
};

export const apiGuardarAccesoDB = async (data: {
  usuarioId: number;
  funcionalidadId: number;
  efecto?: string;
  creadoEn?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}) =>
  dbFetch("/api/db/accesos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const apiEliminarAccesoDB = async (usuarioId: number, funcionalidadId: number) =>
  dbFetch(`/api/db/accesos?usuarioId=${usuarioId}&funcionalidadId=${funcionalidadId}`, {
    method: "DELETE",
  });

// ─── Acciones DB ─────────────────────────────────────────────────────────────

export const apiAccionesDB = async (opts?: { funcionalidadId?: number; estado?: string; search?: string }) => {
  const params = new URLSearchParams();
  if (opts?.funcionalidadId) params.set("funcionalidadId", String(opts.funcionalidadId));
  if (opts?.estado) params.set("estado", opts.estado);
  if (opts?.search) params.set("search", opts.search);
  return dbFetch(`/api/db/acciones?${params}`);
};

export const apiAccionDBById = async (id: number) =>
  dbFetch(`/api/db/acciones/${id}`);

export const apiCrearAccionDB = async (data: { nombre: string; descripcion?: string; estado?: string; funcionalidadIds?: number[] }) =>
  dbFetch("/api/db/acciones", { method: "POST", body: JSON.stringify(data) });

export const apiActualizarAccionDB = async (id: number, data: { nombre?: string; descripcion?: string; estado?: string }) =>
  dbFetch(`/api/db/acciones/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const apiEliminarAccionDB = async (id: number) =>
  dbFetch(`/api/db/acciones/${id}`, { method: "DELETE" });

// Acciones de una funcionalidad específica
export const apiAccionesFuncionalidadDB = async (funcionalidadId: number) =>
  dbFetch(`/api/db/funcionalidades/${funcionalidadId}/acciones`);

export const apiSetAccionesFuncionalidadDB = async (funcionalidadId: number, accionIds: number[]) =>
  dbFetch(`/api/db/funcionalidades/${funcionalidadId}/acciones`, {
    method: "PUT",
    body: JSON.stringify({ accionIds }),
  });

// ─── Menú DB ─────────────────────────────────────────────────────────────────

export const apiMenuDB = async (): Promise<{ success: boolean; menu: any[] }> =>
  dbFetch("/api/db/menu");

// ─── Permisos DB ─────────────────────────────────────────────────────────────

export const apiPermisosDB = async (payload: {
  AplicacionId?: number;
  ObjetoKey?: string;
  ObjetoPath?: string;
  ObjetoTipo?: string;
  AccionKey?: string;
}) =>
  dbFetch("/api/db/permisos", { method: "POST", body: JSON.stringify(payload) });
