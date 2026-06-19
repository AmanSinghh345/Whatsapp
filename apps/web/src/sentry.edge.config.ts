import * as Sentry from "@sentry/nextjs";
import { sanitizeSentryEvent, sanitizeSentrySpan } from "./lib/sentry-sanitize";

if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate:
      Number(process.env.SENTRY_TRACES_SAMPLE_RATE) ||
      (process.env.NODE_ENV === "production" ? 0.1 : 1.0),
    beforeSend(event) {
      return sanitizeSentryEvent(event);
    },
    beforeSendSpan(span) {
      return sanitizeSentrySpan(span);
    },
  });
}
