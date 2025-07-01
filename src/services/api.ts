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
      {
        label: "Configuración",
        icon: "settings",
        path: "/dashboard/configuracion",
      },
      { label: "Reportes", icon: "bar-chart", path: "/dashboard/reportes" },
      { label: "Perfil", icon: "user", path: "/dashboard/perfil" },
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

// Nuevas funciones para importar localidades
export const importarLocalidades = async (departamento: string) => {
  try {
    const overpassQuery = `
      [out:json][timeout:25];
      area["name"="${departamento}"]["admin_level"="4"]->.searchArea;
      node["place"]["name"](area.searchArea);
      out body;
    `;

    const response = await api.post(
      "https://overpass-api.de/api/interpreter",
      overpassQuery,
      {
        headers: { "Content-Type": "text/plain" },
      },
    );

    return response.data.elements.map((node: any) => ({
      name: node.tags.name,
      lat: node.lat,
      lon: node.lon,
      place: node.tags.place,
      departamento,
    }));
  } catch (error) {
    console.error("Error al obtener localidades desde Overpass:", error);
    throw error;
  }
};

export const sendLocalidadToService = async (localidad: any) => {
  try {
    const response = await api.post("/ImportarLocalidades", localidad, {
      withCredentials: true,
    });
    console.log(`Localidad enviada correctamente: ${localidad.name}`);
  } catch (error) {
    console.error(`Error al enviar la localidad ${localidad.name}:`, error);
    throw error;
  }
};

// Nueva función para importar calles
export const importarCalles = async (
  departamento: string,
  localidad: string,
) => {
  try {
    const overpassQuery = `
      [out:json][timeout:25];
      area["name"="Uruguay"]["admin_level"="2"]->.country;
      area["name"="${departamento}"]["admin_level"="4"](area.country)->.depArea;
      area["name"="${localidad}"]["admin_level"="8"](area.depArea)->.searchArea;
      (
        way["highway"]["name"](area.searchArea);
      );
      out tags;
    `;
    const response = await api.post(
      "https://overpass-api.de/api/interpreter",
      overpassQuery,
      {
        headers: { "Content-Type": "text/plain" },
      },
    );
    // Unificar calles por nombre
    const uniqueStreets = Array.from(
      new Map(
        response.data.elements.map((way: any) => [
          way.tags.name,
          { name: way.tags.name, old_name: way.tags.old_name || "N/A" },
        ]),
      ).values(),
    );
    return uniqueStreets;
  } catch (error) {
    console.error("Error al obtener calles desde Overpass:", error);
    throw error;
  }
};

// Nueva función para importar departamentos
export const importarDepartamentos = async () => {
  try {
    const overpassQuery = `
      [out:json][timeout:25];
      area["name"="Uruguay"]["admin_level"="2"]->.searchArea;
      relation["admin_level"="4"]["boundary"="administrative"](area.searchArea);
      out body;
    `;
    const response = await api.post(
      "https://overpass-api.de/api/interpreter",
      overpassQuery,
      {
        headers: { "Content-Type": "text/plain" },
      },
    );
    return response.data.elements.map((rel: any) => ({
      name: rel.tags.name,
      osm_id: rel.id,
      admin_level: rel.tags.admin_level,
      type: rel.tags.type,
      boundary: rel.tags.boundary,
      // Puedes agregar más campos si los necesitas
    }));
  } catch (error) {
    console.error("Error al obtener departamentos desde Overpass:", error);
    throw error;
  }
};
