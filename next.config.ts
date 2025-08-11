// next.config.ts
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const BACKEND_BASE_URL =
  process.env.BACKEND_BASE_URL ??
  "http://192.168.1.72:8082/servicios/SecuritySuite"; // fallback local

const nextConfig: NextConfig = {
  // Recomendado para Docker (standalone build)
  output: "standalone",

  async rewrites() {
    return [
      {
        // El frontend habla a /api/* y Next lo proxyea al Tomcat/GeneXus
        source: "/api/:path*",
        destination: `${BACKEND_BASE_URL}/:path*`,
      },
    ];
  },
};

// Sentry: usá el SLUG del proyecto (sin espacios)
const sentryWebpackPluginOptions = {
  org: "riogas",
  project: "security-suite",
  silent: true,
  // Buenas prácticas para Next + Sentry
  widenClientFileUpload: true,
  transpileClientSDK: true,
  disableLogger: true,
};

export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
