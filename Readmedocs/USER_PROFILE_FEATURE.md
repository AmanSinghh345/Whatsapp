# User Profile and User Lookup Feature

## Status

Implemented.

This feature lets authenticated users update their app profile and lets the frontend find another user by phone number before creating a direct chat.

## Scope Implemented

- Update current user's display name
- Update current user's phone number
- Update current user's avatar URL
- Search user by E.164 phone number
- Sync Firebase user into PostgreSQL during `/api/me`
- Return shared `UserDto` to frontend

## Backend Endpoints

### Update Profile

```text
PATCH /api/users/me
```

Request:

```ts
{
  displayName?: string;
  phoneE164?: string | null;
  avatarUrl?: string;
}
```

Response:

```ts
{
  data: UserDto;
}
```

Validation:

- `displayName` cannot be empty when provided.
- `phoneE164` must use E.164 format.
- `phoneE164` must be unique.
- Empty phone values are stored as `null`.

### Search by Phone

```text
GET /api/users/search?phone=+919876543210
```

Response:

```ts
{
  data: UserDto;
}
```

This is used by the chat sidebar to find another user before creating a direct chat.

## Frontend Flow

Files:

```text
apps/web/src/app/profile/page.tsx
apps/web/src/features/user/api/users.api.ts
```

The profile page:

1. Requires authentication through `ProtectedRoute`.
2. Loads the current app user from the auth store.
3. Lets the user edit display name, phone number, and avatar URL.
4. Calls `PATCH /api/users/me`.
5. Updates the auth store with the returned user.

## Data Model

Relevant `User` fields:

```prisma
model User {
  id          String
  firebaseUid String
  phoneE164   String?
  email       String?
  displayName String
  avatarUrl   String?
  lastSeenAt  DateTime?
}
```

## Key Files

- `apps/api/src/modules/user/user.controller.ts`
- `apps/api/src/modules/user/user.service.ts`
- `apps/web/src/app/profile/page.tsx`
- `apps/web/src/features/user/api/users.api.ts`
- `packages/shared/src/dto/users.dto.ts`
