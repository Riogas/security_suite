"use client";

import axios, {
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";

let loadingProvider: any = null;

// Función para registrar el provider de loading
export const registerLoadingProvider = (provider: any) => {
  loadingProvider = provider;
};

// Mapa para trackear requests activos
const activeRequests = new Map<string, boolean>();

const shouldShowLoading = (url: string) => {
  // No mostrar loading para requests que no son de la API principal
  if (!url || url.includes("overpass") || url.startsWith("http")) return false;

  // Mostrar loading para nuestras APIs
  return (
    url.includes("/api/") ||
    url.includes("listar") ||
    url.includes("abm") ||
    url.includes("crear") ||
    url.includes("editar") ||
    url.includes("eliminar")
  );
};

const getLoadingMessage = (url: string, method: string = "GET"): string => {
  if (!url) return "Cargando...";

  // Mensajes específicos por tipo de operación
  if (url.includes("listarObjetos")) return "Cargando objetos...";
  if (url.includes("listarFuncionalidades"))
    return "Cargando funcionalidades...";
  if (url.includes("listarUsuarios")) return "Cargando usuarios...";
  if (url.includes("listarRoles")) return "Cargando roles...";
  if (url.includes("listarPermisos")) return "Cargando permisos...";
  if (url.includes("listarAplicaciones")) return "Cargando aplicaciones...";

  if (url.includes("abmFuncionalidades")) return "Guardando funcionalidad...";
  if (url.includes("abmUsuarios")) return "Guardando usuario...";
  if (url.includes("abmRoles")) return "Guardando rol...";
  if (url.includes("abmPermisos")) return "Guardando permiso...";

  // Mensajes generales por método HTTP
  switch (method.toUpperCase()) {
    case "POST":
      return "Creando...";
    case "PUT":
      return "Actualizando...";
    case "DELETE":
      return "Eliminando...";
    case "GET":
      return "Cargando datos...";
    default:
      return "Procesando...";
  }
};

// Interceptor de request
export const setupLoadingInterceptors = (axiosInstance: any) => {
  // Request interceptor
  axiosInstance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const url = config.url || "";
      const requestKey = `${config.method}_${url}`;

      if (
        shouldShowLoading(url) &&
        loadingProvider &&
        !activeRequests.has(requestKey)
      ) {
        activeRequests.set(requestKey, true);
        const message = getLoadingMessage(url, config.method);
        loadingProvider.showLoading(message);
      }

      return config;
    },
    (error: AxiosError) => {
      if (loadingProvider) {
        loadingProvider.hideLoading();
      }
      activeRequests.clear();
      return Promise.reject(error);
    },
  );

  // Response interceptor
  axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => {
      const url = response.config.url || "";
      const requestKey = `${response.config.method}_${url}`;

      if (activeRequests.has(requestKey)) {
        activeRequests.delete(requestKey);

        // Si no hay más requests activos, ocultar loading
        if (activeRequests.size === 0 && loadingProvider) {
          setTimeout(() => {
            loadingProvider.hideLoading();
          }, 200); // Breve delay para suavizar
        }
      }

      return response;
    },
    (error: AxiosError) => {
      const url = error.config?.url || "";
      const requestKey = `${error.config?.method}_${url}`;

      if (activeRequests.has(requestKey)) {
        activeRequests.delete(requestKey);
      }

      // Siempre ocultar loading en caso de error
      if (loadingProvider && activeRequests.size === 0) {
        loadingProvider.hideLoading();
      }

      return Promise.reject(error);
    },
  );
};
