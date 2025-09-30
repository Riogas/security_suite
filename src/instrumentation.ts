import * as Sentry from "@sentry/nextjs";

// Solo inicializar Sentry si tenemos un DSN válido y no estamos en desarrollo local
const validDsn =
  process.env.SENTRY_DSN && process.env.SENTRY_DSN !== "your-dsn-here";
const isDevelopment = process.env.NODE_ENV === "development";

if (validDsn && !isDevelopment) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    // Add other Sentry options here
  });
} else {
  console.log("Sentry disabled in development or invalid DSN");
}
