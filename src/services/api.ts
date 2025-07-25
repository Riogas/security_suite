import { api, overpassApi } from "@/lib/axios";
import { withApiLogging, setSentryUser, clearSentryUser } from "@/lib/sentryHelpers";

// Tipos globales
export type Role = "admin" | "user";

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
