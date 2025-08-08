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

// ✅ Mock de menús según rol
export const apiGetMenuByRole = async (role: Role): Promise<MenuItem[]> => {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const menusByRole: Record<Role, MenuItem[]> = {
    root: [
      { label: "Usuarios", icon: "users", path: "/dashboard/usuarios" },
      { label: "Roles", icon: "userCog", path: "/dashboard/roles" },
      { label: "Objetos", icon: "package", path: "/dashboard/objetos" },
      { label: "Eventos", icon: "zap", path: "/dashboard/eventos" },
      { label: "Permisos", icon: "shield", path: "/dashboard/permisos" },
    ],
    admin: [
      { label: "Usuarios", icon: "users", path: "/dashboard/usuarios" },
      { label: "Roles", icon: "userCog", path: "/dashboard/roles" },
      { label: "Objetos", icon: "package", path: "/dashboard/objetos" },
      { label: "Eventos", icon: "zap", path: "/dashboard/eventos" },
      { label: "Permisos", icon: "shield", path: "/dashboard/permisos" },
    ],
    user: [
      { label: "Menu 1", icon: "file-text", path: "/dashboard/menu1" },
      { label: "Menu 2", icon: "list", path: "/dashboard/menu2" },
    ],
  };

  return menusByRole[role] || [];
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
