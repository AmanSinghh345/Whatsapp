# Typing Indicator Feature

## Status

Implemented.

Typing indicators are realtime-only and ephemeral. They are not stored in PostgreSQL.

## Scope Implemented

- Client emits typing updates while composing a message
- Client emits stop-typing after a short idle timeout
- Backend tracks typing users per chat in memory
- Backend broadcasts current typing state to the chat room
- Frontend shows a typing bubble when another user is typing

## Socket Events

### Client to Server

```text
typing:update
```

Payload:

```ts
{
  chatId: string;
  isTyping: boolean;
  clientTs?: string;
}
```

### Server to Client

```text
typing:state
```

Payload currently broadcast by the gateway:

```ts
{
  chatId: string;
  typingUserIds: string[];
  updatedAt: string;
}
```

## Backend Flow

File:

```text
apps/api/src/modules/realtime/socket.gateway.ts
```

Flow:

1. Gateway receives `typing:update`.
2. It stores typing state in an in-memory map:

```text
chatId -> userId -> timestamp
```

3. Stale entries are removed after the configured timeout.
4. Gateway emits `typing:state` to:

```text
chat:{chatId}
```

## Frontend Flow

Files:

```text
apps/web/src/features/realtime/useTyping.ts
apps/web/src/features/realtime/useTypingIndicator.ts
apps/web/src/features/chat/components/TypingBubble.tsx
apps/web/src/features/chat/components/MessageThread.tsx
```

Flow:

1. Message input calls `onKeyStroke`.
2. `useTyping` emits `typing:update` with `isTyping: true`.
3. After 2 seconds without typing, it emits `isTyping: false`.
4. `useTypingIndicator` listens for `typing:state`.
5. Current user's id is filtered out.
6. `TypingBubble` renders if another user is typing.

## Storage Rule

Typing is deliberately ephemeral.

- No PostgreSQL writes
- No Redis writes in the current implementation
- No unread or notification behavior

## Key Files

- `apps/api/src/modules/realtime/socket.gateway.ts`
- `apps/web/src/features/realtime/useTyping.ts`
- `apps/web/src/features/realtime/useTypingIndicator.ts`
- `apps/web/src/features/chat/components/TypingBubble.tsx`
- `packages/shared/src/socket/payloads.ts`
