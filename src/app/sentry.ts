import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  debug: process.env.NODE_ENV === "development",
  release: process.env.npm_package_version,
  environment: process.env.NODE_ENV,
  integrations: [
    Sentry.browserTracingIntegration(),
  ],
  tracePropagationTargets: [
    "localhost",
    /^https:\/\/yourapi\.domain\.com\/api/,
    /^http:\/\/192\.168\.1\.72:8082/,
  ],
  beforeSend(event) {
    if (process.env.NODE_ENV === "development") {
      console.log("🔍 Sentry event:", event);
    }
    return event;
  },    
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;