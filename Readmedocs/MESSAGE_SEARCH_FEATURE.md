# Message Search Feature

## Status

Implemented.

This feature lets an authenticated user search text messages inside the currently selected chat.

## Scope Implemented

- Backend message search endpoint
- Chat membership authorization before searching
- Text-message-only search
- Case-insensitive PostgreSQL search
- Cursor-style pagination support
- Frontend message search API
- Search box in the chat header
- Result list with message text and timestamp
- Clicking a result highlights and scrolls to the message when it is loaded in the current thread

## Not Included

- Global search across all chats
- Attachment/media search
- Full-text search indexes
- Search result deep-loading of messages not currently loaded in the thread
- Search suggestions or recent searches

## Backend Endpoint

```text
GET /api/messages/search?chatId={chatId}&q={query}&cursor={messageId}&limit=20
```

Rules:

- Requires Firebase auth.
- User must be a member of the chat.
- `q` must be at least 2 characters after trimming.
- Only `text` messages are searched.
- Results are ordered newest first.

Response:

```ts
{
  data: MessageDto[];
  nextCursor: string | null;
}
```

## Backend Flow

File:

```text
apps/api/src/modules/message/message.service.ts
```

Flow:

1. Controller validates required query params.
2. Service verifies chat access through `ChatService.getChat`.
3. Service searches `Message.textContent` with case-insensitive `contains`.
4. Service fetches `limit + 1` rows.
5. Service returns `MessageDto[]` plus `nextCursor`.

## Frontend Flow

Files:

```text
apps/web/src/features/chat/api/messages.api.ts
apps/web/src/app/page.tsx
apps/web/src/features/chat/components/MessageThread.tsx
apps/web/src/features/chat/components/MessageBubble.tsx
```

Flow:

1. User enters a query in the selected chat header.
2. Frontend calls `searchMessages(chatId, query)`.
3. Results render below the search input.
4. Clicking a result stores `highlightedMessageId`.
5. `MessageThread` scrolls the loaded message into view.
6. `MessageBubble` applies a highlight ring to the selected result.

## Shared Contracts

Added message search DTOs:

```ts
type SearchMessagesRequestDto = {
  chatId: string;
  q: string;
  cursor?: string;
  limit?: number;
};

type SearchMessagesResponseDto = {
  data: MessageDto[];
  nextCursor: string | null;
};
```

## Key Files

- `packages/shared/src/dto/messages.dto.ts`
- `apps/api/src/modules/message/message.controller.ts`
- `apps/api/src/modules/message/message.service.ts`
- `apps/web/src/features/chat/api/messages.api.ts`
- `apps/web/src/app/page.tsx`
- `apps/web/src/features/chat/components/MessageThread.tsx`
- `apps/web/src/features/chat/components/MessageBubble.tsx`

## Verification

Typechecks passed:

```bash
npm run typecheck -w @chat/api
npm run typecheck -w @chat/web
```
