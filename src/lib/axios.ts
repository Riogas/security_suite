import axios from "axios";
import { toast } from "sonner";

// Instancia para el backend de GeneXus (usa proxy: /api -> http://192.168.1.72:8082/puestos/gestion/)
const api = axios.create({
  baseURL: "/api", // usamos el proxy declarado en next.config.js
  withCredentials: true, // se enviarán cookies si tu backend las requiere
  timeout: 10000, // 10 segundos de timeout
  headers: {
    "Content-Type": "application/json",
  },
});

// Instancia para Overpass
const overpassApi = axios.create({
  baseURL: "https://overpass-api.de/api/interpreter",
  headers: {
    "Content-Type": "text/plain",
  },
  withCredentials: false, // ⬅️ Overpass no permite credenciales
});

function isJwtExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (!payload.exp) return false; // Si no tiene expiración, no se expira
    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now;
  } catch {
    return false;
  }
}

// Interceptor para agregar JWT automáticamente
api.interceptors.request.use((config) => {
  // No agregar token en login
  if (config.url?.includes("loginUser")) {
    return config;
  }
  // Buscar token en cookie
  let token = null;
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|; )token=([^;]*)/);
    if (match && match[1]) token = match[1];
  }
  // Si no está en cookie, buscar en localStorage y re-sincronizar la cookie
  if (!token && typeof window !== "undefined") {
    token = localStorage.getItem("token");
    // Re-sincronizar la cookie desde localStorage (puede haberse perdido por Set-Cookie del backend)
    if (token) {
      console.log("[Axios] ⚠️ Token no encontrado en cookie, recuperado de localStorage");
      document.cookie = `token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
    }
  }
  // Chequear expiración — solo loguear advertencia, NO bloquear.
  // El backend debe ser quien rechace el token (401) si está expirado.
  // Nota: GeneXus puede emitir tokens con exp en 0 o con fecha pasada; dejar que el backend decida.
  if (token && isJwtExpired(token)) {
    console.warn("[Axios] ⚠️ Token JWT parece expirado según exp del payload. Se envía igualmente; el backend decidirá.");
  }
  if (token) {
    config.headers = config.headers || {};
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para manejar errores de respuesta
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === "ECONNRESET" || error.code === "ECONNABORTED") {
      console.error("Error de conexión con el backend:", error.message);
      toast.error(
        "Error de conexión con el servidor. Verifique que el backend esté ejecutándose.",
      );
    } else if (error.response?.status === 401) {
      // Token inválido o expirado
      document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      toast.error("Sesión expirada. Redirigiendo al login...");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
    }
    return Promise.reject(error);
  },
);

// Importar e inicializar el interceptor de loading
import { setupLoadingInterceptors } from "./loadingInterceptor";

// Configurar interceptores de loading para la instancia principal
setupLoadingInterceptors(api);

export { api, overpassApi };
