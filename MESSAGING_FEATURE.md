# Messaging Feature

This document describes the **Messaging Service**, which enables real-time message sending, history retrieval, and delivery status tracking in the chat application.

## Architecture Overview

### Layers

```
┌─────────────────────────────────────────────────────┐
│  Frontend (Next.js)                                 │
│  - Socket.IO client                                 │
│  - Zustand message store                            │
│  - UI components for chat display                   │
└────────────────┬────────────────────────────────────┘
                 │ Socket.IO / REST API
┌────────────────▼────────────────────────────────────┐
│  Message Module                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ MessageController (REST Endpoints)          │   │
│  │  - POST /api/messages (send)                │   │
│  │  - GET /api/messages (list with pagination) │   │
│  │  - POST /api/messages/receipt/upsert        │   │
│  └──────────────────┬──────────────────────────┘   │
│                     │                                │
│  ┌──────────────────▼──────────────────────────┐   │
│  │ MessageService (Business Logic)             │   │
│  │  - sendMessage (idempotent)                │   │
│  │  - getMessages (cursor-based pagination)   │   │
│  │  - getMessage (single)                      │   │
│  │  - upsertReceipt (delivered/seen)          │   │
│  │  - deleteMessage (auth-protected)           │   │
│  └──────────────────┬──────────────────────────┘   │
│                     │                                │
│  ┌──────────────────▼──────────────────────────┐   │
│  │ MessageSocketService (Real-time Bridge)     │   │
│  │  - handleMessageSend (persist + broadcast)  │   │
│  │  - handleReceiptUpsert (persist + broadcast)│   │
│  └──────────────────┬──────────────────────────┘   │
└────────────────────┼────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│  SocketGateway (WebSocket Events)                   │
│  - message:send (@SubscribeMessage)                 │
│  - message:receipt:upsert (@SubscribeMessage)       │
│  - message:new (broadcast)                          │
│  - message:receipt:updated (broadcast)              │
└────────────────┬───────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────┐
│  Prisma ORM + PostgreSQL                            │
│  - Message (with unique constraint on clientMsgId)  │
│  - MessageAttachment                                │
│  - MessageReceipt (delivery status tracking)        │
└─────────────────────────────────────────────────────┘
```

## Models

### Message

```typescript
model Message {
  id              String             @id @default(uuid())
  chatId          String             @db.Uuid
  senderId        String             @db.Uuid
  clientMessageId String             // Idempotency key
  contentType     MessageContentType // "text" | "attachment" | "system"
  textContent     String?
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  // Relations
  chat        Chat
  sender      User
  attachments MessageAttachment[]
  receipts    MessageReceipt[]

  // Indexes
  @@unique([chatId, senderId, clientMessageId]) // Idempotency
  @@index([chatId, createdAt(sort: Desc)])      // Chat history queries
}
```

### MessageReceipt

```typescript
model MessageReceipt {
  id          String    @id @default(uuid())
  messageId   String    @db.Uuid
  recipientId String    @db.Uuid
  deliveredAt DateTime? // NULL until delivered
  seenAt      DateTime? // NULL until seen

  message   Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  recipient User    @relation(fields: [recipientId], references: [id], onDelete: Cascade)

  @@unique([messageId, recipientId]) // One receipt per user per message
}
```

### MessageAttachment

```typescript
model MessageAttachment {
  id                String  @id @default(uuid())
  messageId         String  @db.Uuid
  url               String
  cloudinaryPublicId String
  mimeType          String
  bytes             Int
  width             Int?    // For images
  height            Int?    // For images

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([messageId])
}
```

## Core Features

### 1. **Idempotent Message Sending**

Messages are uniquely identified by `(chatId, senderId, clientMessageId)` constraint. This allows clients to safely retry failed sends without duplicating messages.

**Flow:**

1. Client generates a unique `clientMessageId` (UUID)
2. Client sends message with `clientMessageId`
3. Server checks if message already exists with same `clientMessageId`
4. If exists: return existing message (idempotent)
5. If not: create new message and return

**Benefits:**

- Network failures don't create duplicates
- Clients can safely retry without UI logic
- Duplicate detection happens at database level

### 2. **Cursor-Based Pagination**

Messages are paginated using cursor-based approach for scalability.

**Query Parameters:**

- `cursor`: Last message ID from previous page (optional for first request)
- `limit`: Number of messages to retrieve (max 100, default 20)

**Algorithm:**

1. Fetch `limit + 1` messages ordered by `createdAt DESC`
2. If we got more than `limit`, there's a next page
3. Return `limit` messages in reverse chronological order
4. Set `nextCursor` to last message's ID for next request

**Advantages:**

- Constant time complexity regardless of page number
- Handles concurrent insertions gracefully
- Efficient index usage

### 3. **Message Receipt Tracking**

Tracks three states per recipient:

- **Received**: Message stored on server (implicit)
- **Delivered**: Message received by client
- **Seen**: Message read by user

**Implementation:**

- `MessageReceipt` model with `deliveredAt` and `seenAt` timestamps
- Unique constraint ensures one receipt per user per message
- Receipts created automatically when message is sent
- Client updates receipts via `message:receipt:upsert` event

### 4. **Real-time Broadcasting**

Socket.IO integration for live message updates:

**Events:**

- `message:new`: Broadcast when message is sent to chat room
- `message:receipt:updated`: Broadcast when receipt status changes

**Payload Examples:**

```typescript
// message:new event
{
  id: "uuid",
  chatId: "uuid",
  senderId: "uuid",
  clientMessageId: "client-uuid",
  contentType: "text",
  text: "Hello!",
  attachments: [],
  createdAt: "2025-01-01T12:00:00Z"
}

// message:receipt:updated event
{
  messageId: "uuid",
  recipientId: "uuid",
  status: "seen",
  updatedAt: "2025-01-01T12:00:01Z"
}
```

## API Endpoints

### Send Message

```http
POST /api/messages
Authorization: Bearer {firebase-token}
Content-Type: application/json

{
  "chatId": "uuid",
  "clientMessageId": "unique-client-id",
  "contentType": "text",
  "text": "Hello, World!",
  "attachmentIds": []  // Optional for attachment messages
}

Response (201):
{
  "data": {
    "id": "uuid",
    "chatId": "uuid",
    "senderId": "uuid",
    "clientMessageId": "unique-client-id",
    "contentType": "text",
    "text": "Hello, World!",
    "attachments": [],
    "createdAt": "2025-01-01T12:00:00Z"
  }
}
```

### Get Message History

```http
GET /api/messages?chatId=uuid&cursor=last-message-id&limit=20
Authorization: Bearer {firebase-token}

Response (200):
{
  "data": [
    { /* MessageDto */ },
    { /* MessageDto */ }
  ],
  "nextCursor": "next-message-id" | null
}
```

### Get Single Message

```http
GET /api/messages/:messageId
Authorization: Bearer {firebase-token}

Response (200):
{
  "data": { /* MessageDto */ }
}
```

### Get Message Receipts

```http
GET /api/messages/:messageId/receipts
Authorization: Bearer {firebase-token}

Response (200):
{
  "data": [
    {
      "recipientId": "uuid",
      "recipientName": "John Doe",
      "deliveredAt": "2025-01-01T12:00:01Z",
      "seenAt": "2025-01-01T12:00:05Z"
    }
  ]
}
```

### Update Message Receipt

```http
POST /api/messages/receipt/upsert
Authorization: Bearer {firebase-token}
Content-Type: application/json

{
  "messageId": "uuid",
  "chatId": "uuid",
  "status": "seen",  // "delivered" | "seen"
  "clientReceivedAt": "2025-01-01T12:00:05Z"  // Optional
}

Response (204): No Content
```

### Delete Message

```http
DELETE /api/messages/:messageId
Authorization: Bearer {firebase-token}

Response (204): No Content
```

**Permissions:**

- Sender can always delete their own message
- Chat admins can delete any message

## Socket.IO Events

### Send Message (Client → Server)

```typescript
socket.emit("message:send", {
  chatId: "uuid",
  clientMessageId: "unique-id",
  contentType: "text",
  text: "Hello!",
  attachmentIds: [],
});

// Success response
socket.on("message:send:ack", {
  clientMessageId: "unique-id",
  messageId: "uuid",
  status: "sent",
});

// Error response
socket.on("message:send:error", {
  clientMessageId: "unique-id",
  error: "User not in chat",
});
```

### Message Received (Server → All Clients in Chat)

```typescript
socket.on("message:new", {
  id: "uuid",
  chatId: "uuid",
  senderId: "uuid",
  clientMessageId: "unique-id",
  contentType: "text",
  text: "Hello!",
  attachments: [],
  createdAt: "2025-01-01T12:00:00Z",
});
```

### Update Receipt (Client → Server)

```typescript
socket.emit("message:receipt:upsert", {
  messageId: "uuid",
  chatId: "uuid",
  status: "seen",
  clientReceivedAt: "2025-01-01T12:00:05Z",
});

// Success response
socket.on("message:receipt:upsert:ack", {
  messageId: "uuid",
  status: "updated",
});

// Error response
socket.on("message:receipt:upsert:error", {
  messageId: "uuid",
  error: "Message not found",
});
```

### Receipt Updated (Server → All Clients in Chat)

```typescript
socket.on("message:receipt:updated", {
  messageId: "uuid",
  recipientId: "uuid",
  status: "seen",
  updatedAt: "2025-01-01T12:00:05Z",
});
```

## Error Handling

### REST Errors

| Status | Error                 | Cause                                      |
| ------ | --------------------- | ------------------------------------------ |
| 400    | Bad Request           | Missing required fields, invalid content   |
| 401    | Unauthorized          | Missing/invalid Firebase token             |
| 403    | Forbidden             | User not in chat, insufficient permissions |
| 404    | Not Found             | Message/chat not found                     |
| 500    | Internal Server Error | Database error, service error              |

### Socket.IO Errors

Errors are emitted as `{eventName}:error` events:

```typescript
socket.on("message:send:error", {
  clientMessageId: "id",
  error: "User not in chat",
});
```

## Service Methods

### MessageService

```typescript
class MessageService {
  // Send a message (idempotent via clientMessageId)
  sendMessage(
    userId: string,
    request: SendMessageRequestDto,
  ): Promise<MessageDto>;

  // Get paginated message history
  getMessages(
    chatId: string,
    userId: string,
    cursor?: string,
    limit?: number,
  ): Promise<{ messages: MessageDto[]; nextCursor: string | null }>;

  // Get single message
  getMessage(messageId: string, userId: string): Promise<MessageDto>;

  // Get receipt status for a message
  getMessageReceipts(messageId: string, userId: string): Promise<ReceiptDto[]>;

  // Update receipt status
  upsertReceipt(userId: string, request: UpsertReceiptDto): Promise<void>;

  // Delete message
  deleteMessage(messageId: string, userId: string): Promise<void>;

  // Get count of messages in chat
  getMessageCount(chatId: string): Promise<number>;
}
```

### MessageSocketService

```typescript
class MessageSocketService {
  // Handle incoming message from Socket.IO
  handleMessageSend(
    socket: Socket,
    userId: string,
    payload: SendMessageRequestDto,
  ): Promise<void>;

  // Handle receipt update from Socket.IO
  handleReceiptUpsert(
    socket: Socket,
    userId: string,
    payload: UpsertReceiptDto,
  ): Promise<void>;

  // Broadcast message to chat room
  broadcastMessage(chatId: string, message: MessageDto): void;

  // Broadcast receipt update to chat room
  broadcastReceiptUpdate(
    chatId: string,
    messageId: string,
    recipientId: string,
    status: "delivered" | "seen",
  ): void;
}
```

## Authorization & Permissions

### Message Send

- ✅ User must be member of target chat

### Message Read

- ✅ User must be member of target chat

### Message Delete

- ✅ Own messages: Sender can delete
- ✅ Others' messages: Only chat admins can delete

### Receipt Update

- ✅ User can only update their own receipts
- ✅ Can only update receipts for messages in chats they're members of

## Data Flow Examples

### Sending a Message

```
1. Client generates clientMessageId (UUID)
2. Client calls: POST /api/messages
   {
     chatId: "abc",
     clientMessageId: "xyz-123",
     contentType: "text",
     text: "Hello!"
   }

3. MessageController verifies auth, calls MessageService.sendMessage

4. MessageService:
   - Checks user is member of chat (via ChatService)
   - Validates message content
   - Checks if message already exists (idempotency)
   - Creates Message record in database
   - Creates MessageReceipt records for all other chat members
   - Returns created MessageDto

5. MessageController returns response to client

6. Client also emits message:send Socket.IO event with same payload

7. SocketGateway receives message:send event
   - Calls MessageSocketService.handleMessageSend
   - MessageSocketService repeats step 4 (idempotent)
   - Broadcasts message:new event to all in chat:{chatId} room

8. All connected clients in chat receive message:new event
   - Display message in UI
   - Update message store
```

### Marking Message as Seen

```
1. User opens chat/scrolls to message

2. Frontend detects message visibility, prepares receipt update:
   {
     messageId: "msg-123",
     chatId: "abc",
     status: "seen",
     clientReceivedAt: ISO timestamp
   }

3. Client emits: socket.emit('message:receipt:upsert', payload)

4. SocketGateway receives message:receipt:upsert event
   - Calls MessageSocketService.handleReceiptUpsert
   - MessageSocketService calls MessageService.upsertReceipt
   - Updates MessageReceipt.seenAt timestamp for user
   - Broadcasts message:receipt:updated event to all in chat room

5. All connected clients receive message:receipt:updated
   - Update UI to show message was read by user
   - Update receipt store

6. Server acknowledges with message:receipt:upsert:ack
```

## Scalability Considerations

### Database Optimization

- **Message queries**: Indexed on `(chatId, createdAt DESC)` for efficient history retrieval
- **Receipt queries**: Unique constraint on `(messageId, recipientId)` for fast lookups
- **Cursor pagination**: Prevents N+1 queries, constant time regardless of page

### Real-time Performance

- **Room-based broadcasting**: Socket.IO only sends to users in specific chat room
- **Lazy receipt creation**: Receipts created when message sent, not per-operation
- **Connection tracking**: In-memory user socket map for fast presence checks

### Future Optimizations

- Message caching (Redis) for frequently accessed chats
- Receipt batching (collect multiple receipts, send in batch)
- Message indexing for full-text search
- Archive old messages to separate table

## Testing Strategy

### Unit Tests

- MessageService methods with mocked Prisma
- Idempotency logic with duplicate sends
- Authorization checks

### Integration Tests

- REST API endpoints with real database
- Socket.IO events with real gateway
- Message persistence and retrieval
- Receipt tracking state transitions

### End-to-End Tests

- Send message via REST, verify Socket.IO broadcast
- Update receipt, verify broadcast to all users
- Pagination with cursor over multiple pages
- Permission violations (non-member sending message)

## Related Features

- **Chat Management** ([CHAT_FEATURE.md](CHAT_FEATURE.md)): Create chats, manage members
- **User Management** ([USER_FEATURE.md](USER_FEATURE.md)): User profiles and presence
- **Presence Tracking**: Online status, typing indicators
- **Media Handling**: Message attachments via Cloudinary
