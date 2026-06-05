# Chat Feature Documentation

## Overview

Complete implementation of chat creation, management, and real-time Socket.IO room handling for the WhatsApp/Discord-style chat app.

## Architecture

### 1. REST API Endpoints (`apps/api/src/modules/chat/chat.controller.ts`)

#### Create Chat

- **POST** `/api/chats`
- **Body (Direct Chat)**:
  ```json
  { "otherUserId": "user-id-123" }
  ```
- **Body (Group Chat)**:
  ```json
  {
    "title": "Project Discussion",
    "memberUserIds": ["user-1", "user-2", "user-3"]
  }
  ```
- **Response**:
  ```json
  {
    "data": {
      "id": "chat-uuid",
      "type": "direct",
      "title": null,
      "avatarUrl": null,
      "createdAt": "2026-06-05T...",
      "updatedAt": "2026-06-05T..."
    }
  }
  ```

#### List User's Chats (Paginated)

- **GET** `/api/chats?cursor=chat-id&limit=20`
- **Query Params**:
  - `cursor` (optional): For pagination
  - `limit` (optional): Max 100, default 20
- **Response**:
  ```json
  {
    "data": [...],
    "nextCursor": "chat-id-123" or null
  }
  ```

#### Get Chat Details

- **GET** `/api/chats/:chatId`
- **Response**: Chat DTO with metadata

#### Get Chat Members

- **GET** `/api/chats/:chatId/members`
- **Response**:
  ```json
  {
    "data": [
      {
        "chatId": "chat-123",
        "userId": "user-456",
        "role": "admin",
        "joinedAt": "2026-06-05T..."
      }
    ]
  }
  ```

#### Add Members to Group Chat

- **POST** `/api/chats/:chatId/members`
- **Body**:
  ```json
  { "memberUserIds": ["user-1", "user-2"] }
  ```
- **Auth**: Only group chat admins can add members
- **Response**: Updated chat DTO

#### Remove Member from Chat

- **DELETE** `/api/chats/:chatId/members/:userId`
- **Auth**: Only admins can remove others (users can remove themselves)
- **Response**: 204 No Content

#### Delete Chat

- **DELETE** `/api/chats/:chatId`
- **Auth**: Only admins can delete
- **Response**: 204 No Content

---

## 2. Business Logic (`ChatService`)

### Key Methods

```typescript
// Create direct or group chat
createDirectChat(userId: string, request: CreateDirectChatRequestDto)
createGroupChat(userId: string, request: CreateGroupChatRequestDto)

// Retrieve chats
getChatsByUser(userId: string, cursor?: string, limit?: number)
getChat(chatId: string, userId: string)
getChatMembers(chatId: string, userId: string)

// Manage members
addMembers(chatId: string, currentUserId: string, memberUserIds: string[])
removeMember(chatId: string, currentUserId: string, memberUserIdToRemove: string)

// Chat lifecycle
deleteChat(chatId: string, currentUserId: string)
```

### Features

- ✅ **Idempotent Direct Chat Creation**: Reuses existing direct chat between two users
- ✅ **Admin Roles**: Group chat creators are admins
- ✅ **Cursor-Based Pagination**: Efficient for large chat lists
- ✅ **Permission Checks**: Users can only access/modify their own chats
- ✅ **Member Management**: Add/remove members from group chats

---

## 3. Real-Time Socket.IO Integration

### Socket Events

#### Chat Room Joining

**Client → Server**:

```typescript
socket.emit("chat:join", { chatId: "chat-123" });
socket.emit("chat:leave", { chatId: "chat-123" });
```

**Server → Chat Room**:

```typescript
// Broadcast when user joins
server.to(`chat:${chatId}`).emit("chat:member_joined", {
  userId: "user-123",
  timestamp: "2026-06-05T...",
});

// Broadcast when user leaves
server.to(`chat:${chatId}`).emit("chat:member_left", {
  userId: "user-123",
  timestamp: "2026-06-05T...",
});
```

### Room Conventions

- **User Room**: `user:{firebaseUid}` — Direct messages, notifications
- **Chat Room**: `chat:{chatId}` — Multi-user messages, events

### ChatSocketService

Handles bridging between REST layer and Socket.IO:

```typescript
// Validate membership and join room
await chatSocketService.joinChatRoom(socket, chatId, userId);

// Leave room
await chatSocketService.leaveChatRoom(socket, chatId, userId);

// Broadcast events
chatSocketService.broadcastToChat(chatId, eventName, payload);
chatSocketService.broadcastToUser(userId, eventName, payload);
```

---

## 4. Data Model

### Prisma Schema (Already Implemented)

```prisma
model Chat {
  id        String   @id @default(uuid())
  type      ChatType  // "direct" | "group"
  title     String?   // Group only
  avatarUrl String?
  members   ChatMember[]
  messages  Message[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([type, createdAt(sort: Desc)])
}

model ChatMember {
  id       String @id @default(uuid())
  chatId   String @db.Uuid
  userId   String @db.Uuid
  role     ChatMemberRole  // "admin" | "member"
  joinedAt DateTime @default(now())

  chat User @relation(...)
  user User @relation(...)

  @@unique([chatId, userId])
}
```

---

## 5. Integration Points

### Module Dependencies

```
ChatModule
├── PrismaModule (database)
├── SocketModule (via forwardRef)
└── Exports: ChatService, ChatSocketService
```

### Error Handling

| Error            | Status | Message                             |
| ---------------- | ------ | ----------------------------------- |
| User not found   | 404    | "One or both users not found"       |
| Chat not found   | 404    | "Chat {id} not found"               |
| User not in chat | 403    | "You are not a member of this chat" |
| Not admin        | 403    | "Only admins can add members"       |
| Invalid request  | 400    | "Chat title is required"            |

---

## 6. Testing Guide

### Manual API Tests

```bash
# 1. Create direct chat
curl -X POST http://localhost:4000/api/chats \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "otherUserId": "other-user-id" }'

# 2. List chats
curl http://localhost:4000/api/chats \
  -H "Authorization: Bearer $FIREBASE_TOKEN"

# 3. Create group chat
curl -X POST http://localhost:4000/api/chats \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Team Meeting",
    "memberUserIds": ["user-1", "user-2", "user-3"]
  }'

# 4. Get chat members
curl http://localhost:4000/api/chats/CHAT_ID/members \
  -H "Authorization: Bearer $FIREBASE_TOKEN"

# 5. Add members to group
curl -X POST http://localhost:4000/api/chats/CHAT_ID/members \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "memberUserIds": ["new-user-1", "new-user-2"] }'
```

### Socket.IO Real-Time Testing

**Browser Console** (after login):

```javascript
import { socket } from "@/lib/socket";

// Listen for members joining
socket.on("chat:member_joined", (data) => {
  console.log("Member joined:", data);
});

// Listen for members leaving
socket.on("chat:member_left", (data) => {
  console.log("Member left:", data);
});

// Join a chat room
socket.emit("chat:join", { chatId: "CHAT_ID" });

// Leave a chat room
socket.emit("chat:leave", { chatId: "CHAT_ID" });
```

---

## 7. Next Features

After Chat, implement:

1. **Messaging Service** ✅ (in progress)
   - Send messages to chats
   - Retrieve message history (paginated)
   - Emit `message:new` events

2. **Message Receipts**
   - Mark as delivered/seen
   - Emit `message:receipt:updated` events

3. **Typing Indicators** (Socket.IO only)
   - Already implemented in SocketGateway
   - Just need frontend integration

4. **Presence** (Socket.IO + Redis)
   - Track online/offline status
   - Already implemented in SocketGateway

---

## 8. Performance Considerations

- ✅ **Cursor-based pagination**: O(1) per page, no offset scanning
- ✅ **Indexed queries**: `ChatMember` has indexes on `(chatId, userId)`, `(userId, joinedAt)`
- ✅ **Room isolation**: Broadcasts only to relevant members
- ✅ **Idempotent operations**: Direct chat reuse avoids duplicates

---

## File Structure

```
apps/api/src/modules/chat/
├── chat.controller.ts      # REST endpoints
├── chat.service.ts         # Business logic
├── chat-socket.service.ts  # Socket.IO bridge
├── chat.module.ts          # NestJS module
└── README.md               # This file
```

---

## Checklist

- ✅ Chat CRUD operations
- ✅ Member management
- ✅ Group chat support
- ✅ Direct chat deduplication
- ✅ Cursor-based pagination
- ✅ Socket.IO room joining
- ✅ Permission checks
- ✅ Error handling
- 🔄 **Next**: Implement Messaging feature
