import * as Sentry from "@sentry/nestjs";
import { sanitizeSentryEvent, sanitizeSentrySpan } from "./sentry-sanitize.js";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
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
