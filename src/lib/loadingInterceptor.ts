"use client";

import {
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";

let loadingProvider: any = null;

// Register the loading provider (called from LoadingInitializer)
export const registerLoadingProvider = (provider: any) => {
  loadingProvider = provider;
};

// Tracks pending delay timers: requestKey -> timeout ID
// The overlay is only shown if the request takes longer than LOADING_DELAY_MS.
const pendingTimers = new Map<string, NodeJS.Timeout>();

// Tracks requests that have already triggered the overlay
const activeRequests = new Map<string, boolean>();

const LOADING_DELAY_MS = 600;

const shouldShowLoading = (url: string) => {
  // Skip non-project requests (external URLs, overpass, etc.)
  if (!url || url.includes("overpass") || url.startsWith("http")) return false;

  // Show loading for our project APIs
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

// Derive a stable request key from method + url, including a timestamp so
// concurrent requests to the same endpoint are tracked independently.
const makeRequestKey = (method: string, url: string): string =>
  `${method}_${url}_${Date.now()}`;

const cancelTimer = (requestKey: string) => {
  const timer = pendingTimers.get(requestKey);
  if (timer !== undefined) {
    clearTimeout(timer);
    pendingTimers.delete(requestKey);
  }
};

const finishRequest = (requestKey: string) => {
  cancelTimer(requestKey);

  if (activeRequests.has(requestKey)) {
    activeRequests.delete(requestKey);
    if (activeRequests.size === 0 && loadingProvider) {
      loadingProvider.hideLoading();
    }
  }
};

export const setupLoadingInterceptors = (axiosInstance: any) => {
  // Request interceptor
  axiosInstance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const url = config.url || "";

      // Per-request opt-out: pass headers["x-no-loading"] = "true" to suppress overlay
      if (config.headers?.["x-no-loading"] === "true") {
        return config;
      }

      if (shouldShowLoading(url) && loadingProvider) {
        const requestKey = makeRequestKey(config.method || "get", url);
        // Persist the key on the request so response/error interceptors can look it up
        config.headers = config.headers ?? {};
        config.headers["x-request-key"] = requestKey;

        // Schedule the overlay — only fires if request takes > LOADING_DELAY_MS
        const timer = setTimeout(() => {
          pendingTimers.delete(requestKey);
          activeRequests.set(requestKey, true);
          const message = getLoadingMessage(url, config.method);
          loadingProvider.showLoading(message);
        }, LOADING_DELAY_MS);

        pendingTimers.set(requestKey, timer);
      }

      return config;
    },
    (error: AxiosError) => {
      // On request setup error, clear everything
      pendingTimers.forEach((timer) => clearTimeout(timer));
      pendingTimers.clear();
      activeRequests.clear();
      if (loadingProvider) {
        loadingProvider.hideLoading();
      }
      return Promise.reject(error);
    },
  );

  // Response interceptor (success)
  axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => {
      const requestKey = response.config.headers?.["x-request-key"] as
        | string
        | undefined;
      if (requestKey) {
        finishRequest(requestKey);
      }
      return response;
    },
    (error: AxiosError) => {
      const requestKey = error.config?.headers?.["x-request-key"] as
        | string
        | undefined;
      if (requestKey) {
        finishRequest(requestKey);
      } else if (loadingProvider && activeRequests.size === 0) {
        // Fallback: hide if we can't match a key but nothing else is active
        loadingProvider.hideLoading();
      }
      return Promise.reject(error);
    },
  );
};
