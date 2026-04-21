// next.config.ts
import type { NextConfig } from "next";

const BACKEND_BASE_URL =
  process.env.BACKEND_BASE_URL ??
  "https://sgm.glp.riogas.com.uy/servicios/SecuritySuite";

console.log("[Next.js Config] BACKEND_BASE_URL:", BACKEND_BASE_URL);

// Deshabilitar validación SSL para certificados autofirmados
// Se aplica en todos los entornos porque el backend (sgm.glp.riogas.com.uy) usa certificados autofirmados
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
console.log("[Next.js Config] SSL validation disabled for self-signed certificates");

const nextConfig: NextConfig = {
  // NO usamos rewrites porque no respetan NODE_TLS_REJECT_UNAUTHORIZED
  // En su lugar usamos API routes personalizadas (ver src/app/api/[...proxy])
};

export default nextConfig;
