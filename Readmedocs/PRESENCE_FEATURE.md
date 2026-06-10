# Online / Offline Presence Feature

## Status

Implemented for review.

This feature shows whether a chat member is online, or when they were last seen, in the chat list and chat header.

## Scope Implemented

- Redis-backed live presence tracking
- Durable `lastSeenAt` stored on the `User` table
- Socket lifecycle presence updates
- Shared socket payload typing
- Frontend Zustand presence state
- Presence display in:
  - chat list item
  - selected chat header

## Not Included

- Message receipts
- Media upload
- WebRTC calls
- Group chat behavior changes
- Notifications
- Search

## Backend Flow

### Socket Connect

When a socket connects:

1. Existing socket auth verifies the Firebase token.
2. The socket has the app database `userId` attached.
3. The socket joins the personal room:

```text
user:{userId}
```

4. `PresenceService.markOnline(userId, socketId)` stores the socket id in Redis.
5. If this is the user's first active socket, the server emits:

```text
presence:online
```

### Socket Disconnect

When a socket disconnects:

1. The socket id is removed from the user's Redis socket set.
2. If the user has no remaining sockets:
   - the user is marked offline in Redis
   - `User.lastSeenAt` is updated in PostgreSQL
   - the server emits:

```text
presence:offline
```

## Redis Usage

Redis stores live online state only.

Keys:

```text
presence:user:{userId}:sockets
presence:online-users
```

The socket set allows multiple browser tabs/devices to count as one online user. A user is only offline after their last socket disconnects.

## PostgreSQL Usage

PostgreSQL stores durable offline state.

Added field:

```prisma
model User {
  lastSeenAt DateTime?
}
```

This value is used to render:

```text
Last seen X min ago
```

## Socket Events

The shared socket contract includes:

```text
presence:query
presence:state
presence:online
presence:offline
```

### `presence:query`

Client asks for current presence for specific users.

```ts
{
  userIds: string[];
}
```

### `presence:state`

Server replies with current state for the requested users.

```ts
PresenceStatePayload[]
```

### `presence:online`

Server emits when a user becomes online.

```ts
{
  userId: string;
  state: "online";
  updatedAt: string;
}
```

### `presence:offline`

Server emits when a user becomes offline.

```ts
{
  userId: string;
  state: "offline";
  lastSeenAt: string;
  updatedAt: string;
}
```

## Frontend Flow

The frontend uses:

- `apps/web/src/features/realtime/presence.store.ts`
- `apps/web/src/features/realtime/usePresence.ts`

`usePresence(userIds)`:

1. Connects to the existing Socket.IO client.
2. Emits `presence:query`.
3. Stores returned state in Zustand.
4. Listens for live `presence:online` and `presence:offline` events.

The UI reads presence by user id and renders:

- `Online` when state is online
- `Last seen X min ago` when offline and `lastSeenAt` exists
- `Offline` as a fallback

## Files Changed

- `apps/api/prisma/schema.prisma`
- `apps/api/src/modules/realtime/presence.service.ts`
- `apps/api/src/modules/realtime/socket.gateway.ts`
- `apps/api/src/modules/realtime/socket.module.ts`
- `apps/api/src/modules/chat/chat.service.ts`
- `apps/api/src/modules/user/user.service.ts`
- `apps/api/.env.example`
- `apps/api/package.json`
- `package-lock.json`
- `packages/shared/src/dto/users.dto.ts`
- `packages/shared/src/socket/payloads.ts`
- `apps/web/src/features/realtime/presence.store.ts`
- `apps/web/src/features/realtime/usePresence.ts`
- `apps/web/src/app/page.tsx`

## Environment

Add Redis configuration:

```env
REDIS_URL=redis://localhost:6379
```

## Verification

Typechecks passed:

```bash
npm run typecheck -w @chat/api
npm run typecheck -w @chat/web
```

Prisma generation was attempted but blocked by Windows file locking on Prisma's query engine DLL. Stop any running API/dev process, then run:

```bash
npm run prisma:generate -w @chat/api
npm run prisma:push -w @chat/api
```
