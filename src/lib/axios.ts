import axios from "axios";

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

export { api, overpassApi };
