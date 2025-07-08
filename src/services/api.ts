import { api, overpassApi } from "@/lib/axios";

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
      {
        label: "Normalizar Calles",
        icon: "map",
        path: "/dashboard/normalizar-calles",
      },
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

    const response = await overpassApi.post(
      "https://overpass-api.de/api/interpreter",
      overpassQuery,
      {
        headers: { "Content-Type": "text/plain" },
      },
    );

    return response.data.elements.map((node: any) => ({
      id: node.id,
      lat: node.lat,
      lon: node.lon,
      alt_name: node.tags.alt_name || null,
      name: node.tags.name,
      place: node.tags.place,
      population: node.tags.population || null,
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
    const response = await overpassApi.post(
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
    const response = await overpassApi.post(
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

export const apiGetDepartamentos = async () => {
  const response = await api.get("/getDepartamentos"); // redirige a http://192.168.1.72:8082/puestos/gestion/getDepartamentos
  console.log("Departamentos obtenidos:", response.data);
  return response.data;
};

export const apiImportarDepartamentos = async (body: {
  sdtDepartamentos: { DepartamentoId: string; DepartamentoNombre: string }[];
}) => {
  try {
    const response = await api.post("/importarDepartamentos", body, {
      headers: { "Content-Type": "application/json" },
    });
    console.log("Departamentos importados correctamente:", response.data);
    return response.data;
  } catch (error: any) {
    console.error(
      "Error al importar departamentos:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

export const apiCambiarEstadoDepartamento = async (
  departamentoId: string,
  nuevoEstado: string,
) => {
  try {
    const response = await api.put(
      `/actualizarDepartamentos`,
      {
        DepartamentoId: departamentoId,
        DepartamentoEstado: nuevoEstado,
      },
      {
        headers: { "Content-Type": "application/json" },
      },
    );
    console.log(
      `Estado del departamento ${departamentoId} cambiado a ${nuevoEstado}:`,
      response.data,
    );
    return response.data;
  } catch (error: any) {
    console.error(
      `Error al cambiar estado del departamento ${departamentoId}:`,
      error.response?.data || error.message,
    );
    throw error;
  }
};

export const apiGetLocalidades = async (body: { DepartamentoId: string }) => {
  try {
    console.log("Body enviado a /getLocalidades:", body);
    const response = await api.post("/getLocalidades", body, {
      headers: { "Content-Type": "application/json" },
    });
    console.log("Localidades obtenidas:", response.data);
    return response.data;
  } catch (error: any) {
    console.error(
      "Error al obtener localidades:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

export const apiImportarLocalidades = async (body: {
  sdtLocalidad: {
    DepartamentoId: number;
    LocalidadId: number;
    LocalidadNombre: string;
    LocalidadEstado: string;
    LocalidadLatitud: number;
    LocalidadLongitud: number;
    LocalidadReferencia: string;
    LocalidadTipo: string;
    LocalidadType: string;
    LocalidadAddressType: string;
  }[];
}) => {
  try {
    const response = await api.post("/importarLocalidades", body, {
      headers: { "Content-Type": "application/json" },
    });
    console.log("Localidades importadas correctamente:", response.data);
    return response.data;
  } catch (error: any) {
    console.error(
      "Error al importar localidades:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

export const apiImportarCalles = async (body: {
  sdtCalles: {
    DepartamentoId: number;
    LocalidadId: number;
    CalleNombre: string;
    CalleLatitud: number;
    CalleLongitud: number;
    CalleEstado: string;
    CalleReferencia: string;
    CalleNombreLargo: string;
    CalleTipo: string;
    CalleSuperficie: string;
  }[];
}) => {
  try {
    const response = await api.post("/importarCalles", body, {
      headers: { "Content-Type": "application/json" },
    });
    console.log("Calles importadas correctamente:", response.data);
    return response.data;
  } catch (error: any) {
    console.error(
      "Error al importar calles:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

export const obtenerCallesDesdeCoordenadas = async (
  lat: number,
  lon: number,
) => {
  try {
    // Paso 1: Buscar la relación administrativa (localidad) que contiene las coordenadas
    const buscarRelacionQuery = `
      [out:json][timeout:25];
      is_in(${lat}, ${lon});
      area._["admin_level"="8"]["boundary"="administrative"];
      out ids tags;
    `;

    const relResponse = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: buscarRelacionQuery,
    });

    if (!relResponse.ok) {
      throw new Error("Error al buscar área administrativa desde coordenadas");
    }

    const relData = await relResponse.json();
    const areaId = relData.elements?.[0]?.id;

    if (!areaId) {
      throw new Error(
        "No se encontró un área administrativa (admin_level=8) para estas coordenadas.",
      );
    }

    // Paso 2: Buscar calles dentro de esa área
    const overpassQuery = `
      [out:json][timeout:60];
      way(area:${areaId})["highway"]["name"];
      out tags center;
    `;

    const callesResponse = await fetch(
      "https://overpass-api.de/api/interpreter",
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: overpassQuery,
      },
    );

    if (!callesResponse.ok) {
      throw new Error("Error al obtener calles desde Overpass API");
    }

    const data = await callesResponse.json();

    return data.elements.map((el: any) => ({
      id: el.id,
      name: el.tags?.name || "Sin nombre",
      tipo: el.tags?.highway || "Desconocido",
      lat: el.center?.lat,
      lon: el.center?.lon,
      highway: el.tags?.highway || null,
      surface: el.tags?.surface || null,
      old_name: el.tags?.old_name || null,
    }));
  } catch (error) {
    console.error("Error general:", error);
    throw error;
  }
};

// Placeholder function to fetch polygon data for a locality
export const apiGetPolygonForLocalidad = async (lat: number, lon: number) => {
  try {
    const query = `
      [out:json][timeout:25];
      is_in(${lat}, ${lon})->.a;
      (
        rel(pivot.a)["boundary"="administrative"]["admin_level"="8"];
      );
      out body;
      >;
      out skel qt;
    `;

    const response = await overpassApi.post("/interpreter", query, {
      headers: { "Content-Type": "text/plain" },
    });

    if (response.data && response.data.elements) {
      return response.data; // Return the full Overpass API response
    } else {
      console.error(`No elements found for coordinates: (${lat}, ${lon})`);
      return null;
    }
  } catch (error) {
    console.error(
      `Error fetching polygon for coordinates: (${lat}, ${lon})`,
      error,
    );
    return null;
  }
};

export const apiActualizarEstadoLocalidad = async (body: {
  LocalidadId: number;
  LocalidadEstado: string;
}) => {
  const response = await api.post(`/actualizarEstadoLocalidad`, body, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (response.status !== 200) {
    throw new Error("Failed to update localidad state");
  }

  return response.data;
};

export const apiGetCalles = async (body: {
  DepartamentoId: number;
  LocalidadId: number;
}) => {
  try {
    const response = await api.post("/getCalles", body, {
      headers: { "Content-Type": "application/json" },
    });

    if (response.status !== 200) {
      throw new Error("Failed to fetch calles");
    }

    return response.data;
  } catch (error: any) {
    console.error(
      "Error fetching calles:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

//apiActualizarEstadoCalle
export const apiActualizarEstadoCalle = async (body: {
  CalleId: number;
  CalleEstado: string;
}) => {
  const response = await api.post(`/actualizarEstadoCalle`, body, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (response.status !== 200) {
    throw new Error("Failed to update calle state");
  }

  return response.data;
};

export const apiGetCallesICA = async (body: {
  DepartamentoId: number;
  LocalidadId: number;
}) => {
  try {
    const response = await api.post("/getCallesICA", body, {
      headers: { "Content-Type": "application/json" },
    });

    if (response.status !== 200) {
      throw new Error("Failed to fetch calles");
    }

    return response.data;
  } catch (error: any) {
    console.error(
      "Error fetching calles:",
      error.response?.data || error.message,
    );
    throw error;
  }
};
