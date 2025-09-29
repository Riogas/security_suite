// next.config.ts
import type { NextConfig } from "next";

const BACKEND_BASE_URL =
  process.env.BACKEND_BASE_URL ??
  "http://192.168.1.72:8082/servicios/SecuritySuite";

const nextConfig: NextConfig = {
  output: "standalone",
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
