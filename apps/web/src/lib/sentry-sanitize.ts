type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike | undefined };

type SentryEventLike = {
  request?: {
    headers?: unknown;
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
  };
  user?: unknown;
  message?: unknown;
  logentry?: {
    message?: unknown;
    params?: unknown;
  };
  exception?: {
    values?: Array<Record<string, unknown>>;
  };
  extra?: unknown;
  contexts?: unknown;
  breadcrumbs?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

type SentrySpanLike = {
  name?: unknown;
  description?: unknown;
  data?: unknown;
  attributes?: unknown;
  [key: string]: unknown;
};

const REDACTED = "[Filtered]";

const SENSITIVE_KEY_PATTERNS = [
  /authorization/i,
  /cookie/i,
  /firebase.*token/i,
  /id.*token/i,
  /^token$/i,
  /access.*token/i,
  /refresh.*token/i,
  /phone/i,
  /email/i,
  /password/i,
  /secret/i,
  /message.*body/i,
  /text.*content/i,
  /^text$/i,
  /media.*url/i,
  /private.*url/i,
  /avatar.*url/i,
  /cloudinary/i,
];

const SENSITIVE_VALUE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /eyJ[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+/g,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /\+?\d[\d\s().-]{7,}\d/g,
  /https?:\/\/[^\s"']*cloudinary[^\s"']*/gi,
  /https?:\/\/[^\s"']*(?:private|signed)[^\s"']*/gi,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeString(value: string): string {
  return SENSITIVE_VALUE_PATTERNS.reduce(
    (sanitized, pattern) => sanitized.replace(pattern, REDACTED),
    value
      .replace(/\?[^#\s]*/g, "?[Filtered]")
      .replace(/\/invites\/[^/\s]+/gi, `/invites/${REDACTED}`),
  );
}

function sanitizeValue(value: unknown, key = ""): JsonLike | undefined {
  if (isSensitiveKey(key)) {
    return REDACTED;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item)).filter((item) => item !== undefined);
  }

  if (isRecord(value)) {
    const sanitized: Record<string, JsonLike | undefined> = {};

    for (const [entryKey, entryValue] of Object.entries(value)) {
      sanitized[entryKey] = sanitizeValue(entryValue, entryKey);
    }

    return sanitized;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  return undefined;
}

export function sanitizeSentryEvent<T>(event: T): T {
  const mutableEvent = event as SentryEventLike;

  if (mutableEvent.request) {
    delete mutableEvent.request.headers;
    delete mutableEvent.request.cookies;
    delete mutableEvent.request.data;
    delete mutableEvent.request.query_string;
  }

  delete mutableEvent.user;
  mutableEvent.message = REDACTED;

  if (mutableEvent.logentry) {
    mutableEvent.logentry.message = REDACTED;
    mutableEvent.logentry.params = undefined;
  }

  if (mutableEvent.exception?.values) {
    mutableEvent.exception.values = mutableEvent.exception.values.map((value) => ({
      ...value,
      value: REDACTED,
    }));
  }

  if (mutableEvent.extra) {
    mutableEvent.extra = sanitizeValue(mutableEvent.extra);
  }

  if (mutableEvent.contexts) {
    mutableEvent.contexts = sanitizeValue(mutableEvent.contexts);
  }

  if (mutableEvent.breadcrumbs) {
    mutableEvent.breadcrumbs = mutableEvent.breadcrumbs.map((breadcrumb) => ({
      ...breadcrumb,
      message: REDACTED,
      data: sanitizeValue(breadcrumb.data),
    }));
  }

  return event;
}

export function sanitizeSentrySpan<T>(span: T): T {
  const mutableSpan = span as SentrySpanLike;

  if (typeof mutableSpan.name === "string") {
    mutableSpan.name = sanitizeString(mutableSpan.name);
  }

  if (typeof mutableSpan.description === "string") {
    mutableSpan.description = sanitizeString(mutableSpan.description);
  }

  if (mutableSpan.data) {
    mutableSpan.data = sanitizeValue(mutableSpan.data);
  }

  if (mutableSpan.attributes) {
    mutableSpan.attributes = sanitizeValue(mutableSpan.attributes);
  }

  return span;
}
