import { useEffect, useState } from "react";

export interface UserGlobal {
  nombre: string;
  email: string;
  username: string;
  id: string;
  /**
   * NO usar para decidir si alguien es root. Lo escribe el login del panel, que
   * va por el passthrough a GeneXus y devuelve
   * SERVICIOS.USEREXTENDED.USEREXTENDEDESROOT: otra tabla, otra base, y en
   * producción con los valores INVERTIDOS respecto de secapi. Para eso está
   * `useEsRoot()`, que le pregunta a `GET /api/db/usuarios/yo`.
   */
  isRoot: string;
}

export function useUser() {
  const [user, setUser] = useState<UserGlobal | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch (e) {
        console.warn("⚠️ Dato corrupto en localStorage 'user', limpiando:", e);
        localStorage.removeItem("user");
      }
    }
  }, []);

  // Permite actualizar el usuario globalmente
  const updateUser = (newUser: UserGlobal) => {
    localStorage.setItem("user", JSON.stringify(newUser));
    setUser(newUser);
  };

  // Permite limpiar el usuario (logout)
  const clearUser = () => {
    localStorage.removeItem("user");
    setUser(null);
  };

  return { user, updateUser, clearUser };
}
