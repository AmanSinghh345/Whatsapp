# Realtime Socket Foundation Feature

## Status

Implemented.

The realtime foundation provides authenticated Socket.IO connections for messaging, typing, presence, and chat room events.

## Scope Implemented

- Socket.IO gateway in NestJS
- Firebase-token socket authentication
- Database user lookup during socket auth
- Personal user rooms
- Chat rooms
- Message event delegation
- Typing event handling
- Presence event handling
- Frontend socket client singleton
- Automatic reconnect behavior

## Backend Connection Flow

File:

```text
apps/api/src/modules/realtime/socket.gateway.ts
```

Flow:

1. Client connects with Firebase ID token in socket auth payload.
2. `SocketAuthGuard` verifies the token.
3. Guard finds the app database user by `firebaseUid`.
4. Guard stores these values on `socket.data`:

```ts
{
  user: SocketAuthenticatedUser;
  firebaseUid: string;
  userId: string;
}
```

5. Gateway joins the personal room:

```text
user:{userId}
```

## Room Naming

Personal room:

```text
user:{userId}
```

Chat room:

```text
chat:{chatId}
```

## Supported Event Groups

- Chat room lifecycle:
  - `chat:join`
  - `chat:leave`
- Messages:
  - `message:send`
  - `message:new`
- Message receipts:
  - socket hooks exist as part of messaging implementation
- Typing:
  - `typing:update`
  - `typing:state`
- Presence:
  - `presence:query`
  - `presence:state`
  - `presence:online`
  - `presence:offline`

## Frontend Socket Client

File:

```text
apps/web/src/features/realtime/socket.client.ts
```

Responsibilities:

- Create a Socket.IO client
- Attach Firebase ID token
- Reuse an active socket
- Disconnect stale sockets before reconnecting
- Log connect, disconnect, and connect-error events

## Key Files

- `apps/api/src/modules/realtime/socket.gateway.ts`
- `apps/api/src/modules/realtime/socket-auth.guard.ts`
- `apps/api/src/modules/realtime/socket.module.ts`
- `apps/web/src/features/realtime/socket.client.ts`
- `apps/web/src/lib/socket.ts`
- `packages/shared/src/socket/events.ts`
- `packages/shared/src/socket/payloads.ts`
