# Chat Management Feature

## Status

Implemented.

This feature manages chat creation, chat listing, chat membership, and chat room joining for realtime conversation views.

## Scope Implemented

- Create direct chats
- Reuse an existing direct chat between the same two users
- Create group chats on the backend
- List current user's chats with cursor pagination
- Get one chat by id
- Get chat members
- Add members to group chats
- Remove members from chats
- Delete chats
- Join and leave Socket.IO chat rooms
- Frontend chat list and selected conversation shell

## Backend Endpoints

### Create Chat

```text
POST /api/chats
```

Direct chat request:

```ts
{
  otherUserId: string;
}
```

Group chat request:

```ts
{
  title: string;
  memberUserIds: string[];
}
```

### List Chats

```text
GET /api/chats?cursor={chatId}&limit=20
```

Response:

```ts
{
  data: ChatDto[];
  nextCursor: string | null;
}
```

### Chat Details

```text
GET /api/chats/:chatId
GET /api/chats/:chatId/members
```

### Membership

```text
POST /api/chats/:chatId/members
DELETE /api/chats/:chatId/members/:userId
DELETE /api/chats/:chatId
```

## Realtime Rooms

Socket events:

```text
chat:join
chat:leave
```

Room naming:

```text
chat:{chatId}
```

The selected conversation uses this room for realtime message, typing, and presence updates.

## Frontend Flow

Files:

```text
apps/web/src/app/page.tsx
apps/web/src/features/chat/api/chats.api.ts
apps/web/src/features/user/api/users.api.ts
```

The home page:

1. Loads the current user's chats.
2. Lets the user find another user by phone number.
3. Creates or reuses a direct chat.
4. Selects a chat.
5. Shows the chat header and message thread.

## Authorization

- All chat REST endpoints require Firebase auth.
- Users can only access chats they are members of.
- Direct chats cannot be created with yourself.
- Group membership operations are restricted to admins where applicable.

## Key Files

- `apps/api/src/modules/chat/chat.controller.ts`
- `apps/api/src/modules/chat/chat.service.ts`
- `apps/api/src/modules/chat/chat-socket.service.ts`
- `apps/web/src/app/page.tsx`
- `apps/web/src/features/chat/api/chats.api.ts`
- `packages/shared/src/dto/chats.dto.ts`
