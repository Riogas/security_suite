import api from "@/lib/axios";

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
  // TODO: Descomentá esto cuando tengas backend
  // return api.post("/auth/login", { email, password });

  // Mock temporal
  return new Promise((resolve) =>
    setTimeout(() => {
      resolve({
        data: {
          success: true,
          user: {
            name: "Julio Gómez",
            email: "julio.gomez@riogas.com.uy",
            role: "admin", // Cambiar a "user" si querés simular otro perfil
            token: "fake-jwt-token-12345",
          },
        },
      });
    }, 1000),
  );
};

// ✅ Mock de menús según rol
export const apiGetMenuByRole = async (role: Role): Promise<MenuItem[]> => {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const menusByRole: Record<Role, MenuItem[]> = {
    admin: [
      { label: "Clientes", icon: "users", path: "/dashboard/clientes" },
      { label: "Pedidos", icon: "package", path: "/dashboard/pedidos" },
      { label: "Moviles", icon: "truck", path: "/dashboard/moviles" },
      { label: "Zonas", icon: "map", path: "/dashboard/mapa" },
    ],
    user: [
      { label: "Menu 1", icon: "file-text", path: "/dashboard/menu1" },
      { label: "Menu 2", icon: "list", path: "/dashboard/menu2" },
    ],
  };

  return menusByRole[role] || [];
};

// ✅ Funciones reales (cuando el backend esté listo)
export const apiGetCurrentUser = () => api.get("/auth/me");

export const apiUpdateProfile = (data: { name: string; avatar?: string }) =>
  api.put("/user/profile", data);

export const apiDeleteAccount = () => api.delete("/user");
