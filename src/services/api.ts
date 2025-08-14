import { api, overpassApi } from "@/lib/axios";
import { withApiLogging, setSentryUser, clearSentryUser } from "@/lib/sentryHelpers";

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
      const result = await new Promise<{ data: { success: boolean; user: User } }>((resolve) =>
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
        }, 1000)
      );
      
      return result;
    },
    "POST",
    { email, password: "[HIDDEN]" } // No loggear la contraseña real
  );
};

// ✅ Menú real: siempre envía { AplicacionNombre: "SecuritySuite" }
export const apiMenu = async () => {
  try {
    const response = await api.post(
      "/Menu",
      { AplicacionNombre: "SecuritySuite" },
      {
        headers: { "Content-Type": "application/json" },
        withCredentials: true,
      }
    );
    return response.data;
  } catch (error: any) {
    console.error(
      "Error al obtener el menú:",
      error.response?.data || error.message
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
export const apiLoginUser = async (body: { UserName: string; Password: string , Sistema: string }) => {
  try {
    const response = await api.post("/loginUser",
      body,
      {
        headers: { "Content-Type": "application/json" },
        withCredentials: true,
      }
    );
    // Guardar token en cookie
    if (response.data?.token) {
      document.cookie = `token=${response.data.token}; path=/; max-age=${60 * 60 * 24 * 7}`;
    }
    // Guardar usuario en localStorage
    if (response.data?.user) {
      localStorage.setItem("user", JSON.stringify({
        nombre: response.data.user.nombre,
        email: response.data.user.email,
        username: response.data.user.username,
        id: response.data.user.id,
        isRoot: response.data.user.isRoot,
      }));
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
// { AplicacionNombre, ObjetoKey, ObjetoTipo, AccionKey }
// =====================

export type ValidarPermisoReq = {
  AplicacionNombre: string;
  ObjetoKey: string;          // ej: "page.dashboard.usuarios.add"
  ObjetoTipo: "MENU" | "PAGE" | "FEATURE" | string;
  AccionKey:
    | "view"
    | "execute"
    | "create"
    | "update"
    | "delete"
    | "export"
    | string;
};

export type ValidarPermisoResp = {
  permitido: boolean;
  redirect?: string;
  reason?: string;
  [k: string]: unknown;
};

export const apiValidarPermiso = async (
  payload: ValidarPermisoReq,
  opts?: { signal?: AbortSignal }
): Promise<ValidarPermisoResp> => {
  try {
    const res = await api.post(
      "/Permisos",            // ⬅️ endpoint solicitado
      payload,                // ⬅️ { AplicacionNombre, ObjetoKey, ObjetoTipo, AccionKey }
      { signal: opts?.signal, withCredentials: true }
    );

    const permitido =
      res.data?.permitido === true ||
      res.data?.ok === true ||
      res.data?.success === true;

    return {
      permitido,
      redirect: res.data?.redirect,
      reason: res.data?.reason,
      ...res.data,
    } as ValidarPermisoResp;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
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
  opts?: { signal?: AbortSignal }
) => {
  try {
    const res = await api.post(
      "/usuarios",
      payload,
      { signal: opts?.signal, withCredentials: true }
    );
    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
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
  opts?: { signal?: AbortSignal }
) => {
  try {
    const res = await api.post(
      "/aplicaciones",
      payload,
      { signal: opts?.signal, withCredentials: true }
    );
    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
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
  opts?: { signal?: AbortSignal }
) => {
  try {
    const res = await api.post(
      "/roles",
      payload,
      { signal: opts?.signal, withCredentials: true }
    );
    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
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
  opts?: { signal?: AbortSignal }
) => {
  try {
    const res = await api.post(
      "/objetos",
      payload,
      { signal: opts?.signal, withCredentials: true }
    );
    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
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
  opts?: { signal?: AbortSignal }
) => {
  try {
    const res = await api.post(
      "/eventos",
      payload,
      { signal: opts?.signal, withCredentials: true }
    );
    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
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
  opts?: { signal?: AbortSignal }
) => {
  try {
    const res = await api.post(
      "/accesos",
      payload,
      { signal: opts?.signal, withCredentials: true }
    );
    return res.data;
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 401) {
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

    if (status === 403) {
      return error?.response?.data || { reason: "FORBIDDEN" };
    }

    throw error;
  }
};
