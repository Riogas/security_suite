import axios from "axios";
import { toast } from "sonner";

// Instancia para el backend de GeneXus (usa proxy: /api -> http://192.168.1.72:8082/puestos/gestion/)
const api = axios.create({
  baseURL: "/api", // usamos el proxy declarado en next.config.js
  withCredentials: true, // se enviarán cookies si tu backend las requiere
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
    if (match) token = match[1];
  }
  // Si no está en cookie, buscar en localStorage
  if (!token && typeof window !== "undefined") {
    token = localStorage.getItem("token");
  }
  // Chequear expiración
  if (token && isJwtExpired(token)) {
    // Eliminar token de cookie y localStorage
    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    // Mostrar mensaje y redirigir al login
    if (typeof window !== "undefined") {
      toast.error("Su sesión ha expirado, por favor vuelva a loguearse");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
    }
    return Promise.reject(new Error("Token expirado"));
  }
  if (token) {
    config.headers = config.headers || {};
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

export { api, overpassApi };
