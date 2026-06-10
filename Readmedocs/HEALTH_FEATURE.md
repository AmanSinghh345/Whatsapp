# Health Check Feature

## Status

Implemented.

The health feature provides simple endpoints for checking whether the API is running and whether auth is working.

## Scope Implemented

- Public API health endpoint
- Authenticated health/current-user endpoint

## Endpoints

### Public Health

```text
GET /api/health
```

Response:

```ts
{
  status: "ok";
  timestamp: string;
}
```

### Authenticated Health

```text
GET /api/health/me
```

Requires Firebase Bearer token.

Response:

```ts
{
  user: AuthenticatedRequestUser;
  authenticated: true;
}
```

## Purpose

- Confirm the API process is reachable.
- Confirm Firebase auth verification is wired.
- Provide a lightweight smoke-test endpoint during local development.

## Key Files

- `apps/api/src/modules/health/health.controller.ts`
- `apps/api/src/modules/health/health.module.ts`
- `apps/api/src/app.module.ts`
