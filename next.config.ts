// next.config.ts
import type { NextConfig } from "next";

const BACKEND_BASE_URL =
  process.env.BACKEND_BASE_URL ??
  "https://sgm-dev.glp.riogas.com.uy";

const nextConfig: NextConfig = {
  // output: "standalone", // ❌ No se necesita sin Docker
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_BASE_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
