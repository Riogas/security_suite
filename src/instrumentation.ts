import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN || 'your-dsn-here',
  tracesSampleRate: 1.0, // Adjust this value as needed
  // Add other Sentry options here
});