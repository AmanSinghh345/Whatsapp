# Authentication Feature

## Status

Implemented.

Authentication uses Firebase ID tokens as the only auth mechanism for v1. The backend verifies Firebase tokens and syncs the authenticated Firebase user into the app database through `/api/me`.

## Scope Implemented

- Firebase client initialization on the frontend
- Firebase session persistence
- Google login action
- Phone OTP scaffold placeholder
- `/api/me` backend hydration endpoint
- Firebase Admin token verification on the backend
- Protected route wrapper on the frontend
- Zustand auth store
- Forced sign-out when Firebase session exists but backend `/me` rejects it

## Backend Flow

### `GET /api/me`

File:

```text
apps/api/src/modules/auth/auth.controller.ts
```

Flow:

1. Client sends Firebase ID token as a Bearer token.
2. `FirebaseAuthGuard` verifies the token through Firebase Admin.
3. Backend syncs the Firebase user into PostgreSQL through `UserService.syncFromAuthUser`.
4. Backend returns the app user as the source of truth.

Response shape:

```ts
{
  user: UserDto;
}
```

## Frontend Flow

Files:

```text
apps/web/src/features/auth/lib/firebase-client.ts
apps/web/src/features/auth/store/auth.store.ts
apps/web/src/features/auth/components/auth-hydrator.tsx
apps/web/src/features/auth/components/protected-route.tsx
apps/web/src/features/auth/api/me.api.ts
apps/web/src/features/auth/lib/login-actions.ts
apps/web/src/app/login/page.tsx
```

Flow:

1. Firebase restores the browser session.
2. `AuthHydrator` listens with `onIdTokenChanged`.
3. If a Firebase user exists, frontend requests `/api/me`.
4. Auth store is set to authenticated with the backend app user.
5. If `/api/me` fails, frontend signs out and marks the user unauthenticated.

## Login Methods

Implemented:

- Google login using `signInWithPopup`

Scaffolded only:

- Phone OTP start method
- Full reCAPTCHA and OTP verification flow is not wired yet

## Security Notes

- The frontend does not issue custom JWTs.
- Backend APIs trust only Firebase ID tokens.
- `/api/me` is the app profile source of truth.

## Key Files

- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/firebase-auth.guard.ts`
- `apps/api/src/modules/auth/firebase-admin.service.ts`
- `apps/web/src/features/auth/components/auth-hydrator.tsx`
- `apps/web/src/features/auth/components/protected-route.tsx`
- `apps/web/src/features/auth/store/auth.store.ts`
- `apps/web/src/features/auth/lib/login-actions.ts`
