import type { NextConfig } from "next";

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*", // tu frontend llamará a /api/loquesea
        destination: "http://192.168.1.72:8082/puestos/gestion/:path*", // se redirige al backend GeneXus
      },
    ];
  },
};

export default nextConfig;
