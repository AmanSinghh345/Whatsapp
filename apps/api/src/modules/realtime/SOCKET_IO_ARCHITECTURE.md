# Socket.IO Architecture

## Overview

Real-time communication using Socket.IO with TypeScript-safe event contracts, Firebase authentication, and room-based message broadcasting.

## Room Conventions

All rooms follow the pattern: `{scope}:{id}`

### User Rooms

- **Pattern**: `user:{firebaseUid}`
- **Purpose**: Direct messaging, presence updates, and user-specific notifications
- **Subscribers**: Only the user themselves
- **Use Case**: Unread counts, presence state changes

### Chat Rooms

- **Pattern**: `chat:{chatId}`
- **Purpose**: Multi-user message broadcasting within a chat
- **Subscribers**: All members of the chat
- **Use Case**: Messages, typing indicators, call signals

## Connection Flow

### Server-Side (Backend)

1. **Client connects** with Bearer token in `socket.auth.token`
2. **SocketAuthGuard** verifies Firebase ID token
3. **User attached** to `socket.data.user`
4. **Rooms joined**:
   - `user:{firebaseUid}` - automatically
   - `chat:{chatId}` - on-demand via controller/service

### Client-Side (Frontend)

```typescript
import { connectSocket, disconnectSocket, socket } from "@/lib/socket";

// In auth hook after Firebase login:
const idToken = await user.getIdToken();
await connectSocket(idToken);

// In cleanup:
disconnectSocket();
```

## Event Categories

### Messaging Events

| Event                     | Direction       | Payload                       | Purpose               |
| ------------------------- | --------------- | ----------------------------- | --------------------- |
| `message:send`            | C→S             | `SendMessageRequestDto`       | Send new message      |
| `message:send:ack`        | S→C             | `{ clientMessageId, status }` | Acknowledge send      |
| `message:new`             | S→C (broadcast) | `MessageDto`                  | New message in chat   |
| `message:receipt:upsert`  | C→S             | `UpsertReceiptDto`            | Mark delivered/seen   |
| `message:receipt:updated` | S→C (broadcast) | `MessageReceiptDto`           | Receipt state changed |

### Typing Events

| Event           | Direction       | Payload               | Purpose               |
| --------------- | --------------- | --------------------- | --------------------- |
| `typing:update` | C→S             | `TypingUpdatePayload` | User typing indicator |
| `typing:state`  | S→C (broadcast) | `TypingStatePayload`  | Chat typing state     |

**Typing TTL**: 3 seconds (auto-clear if no update)

### Presence Events

| Event              | Direction       | Payload                  | Purpose             |
| ------------------ | --------------- | ------------------------ | ------------------- |
| `presence:query`   | C→S             | `PresenceQueryPayload`   | Check online status |
| `presence:state`   | S→C             | `PresenceStatePayload[]` | Query response      |
| `presence:online`  | S→C (broadcast) | `PresenceStatePayload`   | User came online    |
| `presence:offline` | S→C (broadcast) | `PresenceStatePayload`   | User went offline   |

### Call Events

| Event          | Direction       | Payload           | Purpose            |
| -------------- | --------------- | ----------------- | ------------------ |
| `call:created` | S→C (user room) | `CallSessionDto`  | Call initiated     |
| `call:join`    | C→S             | `{ callId }`      | User joins call    |
| `call:leave`   | C→S             | `{ callId }`      | User leaves call   |
| `call:signal`  | C→S             | `WebRtcSignalDto` | WebRTC signaling   |
| `call:state`   | S→C (broadcast) | `CallSessionDto`  | Call state changed |

## Architecture Pattern

### Backend Flow

```
Client Connection
    ↓
SocketAuthGuard (verify token)
    ↓
SocketGateway (route events)
    ↓
@SubscribeMessage handlers
    ↓
Service Layer (business logic + persistence)
    ↓
Broadcast to rooms
```

### Frontend Flow

```
connectSocket(idToken)
    ↓
socket.connect()
    ↓
Listen for events
    ↓
socket.emit(...) to send
    ↓
Update Zustand store
    ↓
Render UI
```

## Implementation Checklist

### Backend Services (To Implement)

- [ ] **ChatService**
  - `createChat()`, `getChats()`, `getChat()`, `joinChat()`
  - Emit `chat:joined` when user joins a chat room
- [ ] **MessageService**
  - `sendMessage()` → persist + broadcast `message:new`
  - `getMessages()` → cursor-paginated history
- [ ] **ReceiptService**
  - Handle `message:receipt:upsert` → persist + broadcast `message:receipt:updated`
- [ ] **PresenceService**
  - Track online/offline via Redis
  - Respond to `presence:query` with room/online data
- [ ] **TypingService**
  - Track typing state in memory
  - Auto-expire entries after 3s
- [ ] **CallService**
  - Create call sessions
  - Broadcast `call:created` to initiator
  - Handle WebRTC signaling via `call:signal`

### Frontend Hooks (To Implement)

- [ ] `useSocket()` — Connection management
- [ ] `useMessages(chatId)` — Subscribe to chat messages
- [ ] `useTyping(chatId)` — Subscribe to typing indicators
- [ ] `usePresence(userIds)` — Query and subscribe to presence
- [ ] `useCalls()` — Subscribe to incoming calls

## Error Handling

### Connection Errors

- **Missing token**: `UnauthorizedException` → redirect to login
- **Invalid token**: `UnauthorizedException` → refresh token + retry
- **Expired token**: Refresh token before reconnecting

### Event Errors

- **Validation error**: Response with error payload
- **Service error**: Log server-side, return generic error to client

## Security

1. **Token Verification**: Every connection verified against Firebase Admin SDK
2. **Room Isolation**: Users can only join authorized rooms (enforced by service layer)
3. **Rate Limiting**: TODO - add per-user/per-room event rate limits
4. **CORS**: Configured for whitelisted origins only

## Testing

### Manual Testing

```bash
# Terminal 1: Start backend
cd apps/api && npm run dev

# Terminal 2: Start frontend
cd apps/web && npm run dev

# Browser console:
import { socket, connectSocket } from "@/lib/socket"
await connectSocket(firebaseToken)
socket.emit("typing:update", { chatId: "...", isTyping: true })
```

### Socket.IO Admin UI (Optional)

Install `@socket.io/admin-ui` for real-time connection monitoring.

## Performance Considerations

- **Typing TTL**: 3s avoids stale state
- **Presence Caching**: Query responses cached to avoid repeated DB hits
- **Room Broadcasting**: Only members of chat receive messages
- **Graceful Disconnect**: Typing state cleaned up automatically

## Next Steps

1. Implement ChatService + endpoints
2. Implement MessageService + persistence
3. Add frontend hooks with Zustand integration
4. Test end-to-end message flow
5. Add WebRTC call signaling
