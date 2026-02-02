// next.config.ts
import type { NextConfig } from "next";

const BACKEND_BASE_URL =
  process.env.BACKEND_BASE_URL ??
  "https://sgm-dev.glp.riogas.com.uy/servicios/SecuritySuite";

console.log("[Next.js Config] BACKEND_BASE_URL:", BACKEND_BASE_URL);

const nextConfig: NextConfig = {
  // output: "standalone", // ❌ No se necesita sin Docker
  async rewrites() {
    console.log("[Next.js Config] Configurando rewrites para:", BACKEND_BASE_URL);
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_BASE_URL}/:path*`,
      },
    ];
  },
  // Configuración para prevenir problemas de SSL
  serverRuntimeConfig: {
    // Esto es solo para servidor
  },
  publicRuntimeConfig: {
    // Esto es para cliente y servidor
  },
};

export default nextConfig;
