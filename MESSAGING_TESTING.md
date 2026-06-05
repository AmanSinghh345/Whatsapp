# Messaging Feature - Testing Guide

This guide demonstrates how to test the Messaging Service with various scenarios using cURL, Postman, or Socket.IO client libraries.

## Prerequisites

- Backend running on `http://localhost:4000`
- Firebase project configured
- Valid Firebase ID token for testing
- Chat already created with multiple members
- Socket.IO connection established

## Setup for Testing

### 1. Get Firebase ID Token

```bash
# Using Firebase CLI
firebase auth:export /tmp/users.json --project=your-project

# Or via REST API
curl -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=YOUR_WEB_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "returnSecureToken": true
  }'
```

### 2. Create Test Chat

```bash
TOKEN="your-firebase-token"

curl -X POST http://localhost:4000/api/chats \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "group",
    "title": "Test Chat",
    "memberUserIds": ["user-id-1", "user-id-2", "user-id-3"]
  }'

# Response contains chatId - save it
CHAT_ID="returned-chat-id"
```

## REST API Testing

### Test 1: Send a Text Message

```bash
TOKEN="your-firebase-token"
CHAT_ID="your-chat-id"
CLIENT_MESSAGE_ID=$(uuidgen)

curl -X POST http://localhost:4000/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"chatId\": \"$CHAT_ID\",
    \"clientMessageId\": \"$CLIENT_MESSAGE_ID\",
    \"contentType\": \"text\",
    \"text\": \"Hello, this is a test message!\"
  }"

# Expected Response:
# {
#   "data": {
#     "id": "msg-uuid",
#     "chatId": "chat-uuid",
#     "senderId": "sender-uuid",
#     "clientMessageId": "client-msg-id",
#     "contentType": "text",
#     "text": "Hello, this is a test message!",
#     "attachments": [],
#     "createdAt": "2025-01-01T12:00:00Z"
#   }
# }

MESSAGE_ID="msg-uuid"  # From response
```

**Verification:**

- ✅ Status code 201
- ✅ Message has unique UUID `id`
- ✅ `senderId` matches authenticated user
- ✅ `createdAt` is current timestamp
- ✅ `attachments` array is empty

### Test 2: Send Message (Idempotency Test)

Send the **exact same message** twice with same `clientMessageId`:

```bash
CLIENT_MESSAGE_ID="same-client-id"

# First send
curl -X POST http://localhost:4000/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"chatId\": \"$CHAT_ID\",
    \"clientMessageId\": \"$CLIENT_MESSAGE_ID\",
    \"contentType\": \"text\",
    \"text\": \"Duplicate test\"
  }"

# Second send - should return SAME message
curl -X POST http://localhost:4000/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"chatId\": \"$CHAT_ID\",
    \"clientMessageId\": \"$CLIENT_MESSAGE_ID\",
    \"contentType\": \"text\",
    \"text\": \"Duplicate test\"
  }"
```

**Expected Behavior:**

- Both requests return identical `id` and `createdAt`
- No duplicate messages created in database
- Second request completes faster (no processing)

### Test 3: Get Message History (Pagination)

```bash
# First page (no cursor)
curl -X GET "http://localhost:4000/api/messages?chatId=$CHAT_ID&limit=5" \
  -H "Authorization: Bearer $TOKEN"

# Expected Response:
# {
#   "data": [
#     { /* MessageDto */ },
#     { /* MessageDto */ }
#   ],
#   "nextCursor": "message-id-5" | null
# }

NEXT_CURSOR="message-id-5"  # From response

# Second page (with cursor)
curl -X GET "http://localhost:4000/api/messages?chatId=$CHAT_ID&cursor=$NEXT_CURSOR&limit=5" \
  -H "Authorization: Bearer $TOKEN"
```

**Verification:**

- ✅ Returns messages in reverse chronological order (newest first)
- ✅ `limit` parameter respected (max 100)
- ✅ `nextCursor` provided if more messages exist
- ✅ `nextCursor` is null on last page

### Test 4: Get Single Message

```bash
MESSAGE_ID="msg-uuid"

curl -X GET "http://localhost:4000/api/messages/$MESSAGE_ID" \
  -H "Authorization: Bearer $TOKEN"

# Expected Response:
# {
#   "data": { /* MessageDto */ }
# }
```

**Verification:**

- ✅ Returns correct message by ID
- ✅ Includes full message details and attachments

### Test 5: Get Message Receipts

```bash
curl -X GET "http://localhost:4000/api/messages/$MESSAGE_ID/receipts" \
  -H "Authorization: Bearer $TOKEN"

# Expected Response:
# {
#   "data": [
#     {
#       "recipientId": "user-uuid",
#       "recipientName": "John Doe",
#       "deliveredAt": "2025-01-01T12:00:01Z",
#       "seenAt": null
#     },
#     {
#       "recipientId": "user-uuid-2",
#       "recipientName": "Jane Smith",
#       "deliveredAt": null,
#       "seenAt": null
#     }
#   ]
# }
```

**Verification:**

- ✅ Lists all recipients of message
- ✅ Shows `deliveredAt` and `seenAt` timestamps
- ✅ Null timestamps for unreceived/unseen messages

### Test 6: Update Message Receipt

```bash
curl -X POST http://localhost:4000/api/messages/receipt/upsert \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"messageId\": \"$MESSAGE_ID\",
    \"chatId\": \"$CHAT_ID\",
    \"status\": \"delivered\",
    \"clientReceivedAt\": \"2025-01-01T12:00:01Z\"
  }"

# Expected Response: 204 No Content
```

**Verification:**

- ✅ Status code 204
- ✅ Receipt updated in database
- ✅ Verify with GET receipts endpoint

**Update to 'seen' status:**

```bash
curl -X POST http://localhost:4000/api/messages/receipt/upsert \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"messageId\": \"$MESSAGE_ID\",
    \"chatId\": \"$CHAT_ID\",
    \"status\": \"seen\"
  }"
```

### Test 7: Delete Message

```bash
# Delete own message
curl -X DELETE "http://localhost:4000/api/messages/$MESSAGE_ID" \
  -H "Authorization: Bearer $TOKEN"

# Expected Response: 204 No Content
```

**Verification:**

- ✅ Message deleted from database
- ✅ Message no longer appears in history
- ✅ GET returns 404

**Permission Test:**

```bash
# Try to delete someone else's message (non-admin)
curl -X DELETE "http://localhost:4000/api/messages/$OTHER_USER_MESSAGE_ID" \
  -H "Authorization: Bearer $OTHER_USER_TOKEN"

# Expected: 403 Forbidden
```

## Socket.IO Real-time Testing

### Setup Socket.IO Connection

```javascript
// Node.js example with socket.io-client
import io from "socket.io-client";

const socket = io("http://localhost:4000", {
  auth: {
    token: "your-firebase-id-token",
  },
});

socket.on("connect", () => {
  console.log("✅ Connected to Socket.IO");
});

socket.on("disconnect", () => {
  console.log("❌ Disconnected from Socket.IO");
});

socket.on("error", (error) => {
  console.error("Socket error:", error);
});
```

### Test 8: Send Message via Socket.IO

```javascript
const clientMessageId = "socket-test-" + Date.now();

socket.emit("message:send", {
  chatId: "your-chat-id",
  clientMessageId: clientMessageId,
  contentType: "text",
  text: "Hello via Socket.IO!",
});

// Listen for acknowledgement
socket.on("message:send:ack", (ack) => {
  console.log("✅ Message sent:", ack);
  // {
  //   clientMessageId: "socket-test-...",
  //   messageId: "uuid",
  //   status: "sent"
  // }
});

// Listen for errors
socket.on("message:send:error", (error) => {
  console.error("❌ Send failed:", error);
});
```

### Test 9: Receive Messages (Broadcast)

**Scenario:** Send message in one terminal, receive in another

**Terminal 1 (Sender):**

```javascript
socket.emit("message:send", {
  chatId: "chat-uuid",
  clientMessageId: "msg-1",
  contentType: "text",
  text: "Broadcast test",
});
```

**Terminal 2 (Other User):**

```javascript
socket.on("message:new", (message) => {
  console.log("✅ Received message:", message);
  // {
  //   id: "uuid",
  //   chatId: "chat-uuid",
  //   senderId: "other-user-uuid",
  //   text: "Broadcast test",
  //   createdAt: "2025-01-01T12:00:00Z"
  // }
});
```

**Verification:**

- ✅ Terminal 2 receives message in real-time
- ✅ All message fields are present
- ✅ Sender info is correct

### Test 10: Receipt Updates (Real-time)

**Terminal 1 (Sender):**

```javascript
socket.on("message:receipt:updated", (receipt) => {
  console.log("✅ Receipt updated:", receipt);
  // {
  //   messageId: "uuid",
  //   recipientId: "user-uuid",
  //   status: "seen",
  //   updatedAt: "2025-01-01T12:00:05Z"
  // }
});
```

**Terminal 2 (Recipient):**

```javascript
socket.emit("message:receipt:upsert", {
  messageId: "msg-uuid",
  chatId: "chat-uuid",
  status: "seen",
});

socket.on("message:receipt:upsert:ack", (ack) => {
  console.log("✅ Receipt updated:", ack);
});
```

**Verification:**

- ✅ Terminal 1 receives update in real-time
- ✅ Status transitions from null → "delivered" → "seen"
- ✅ Timestamp is accurate

## Error Scenarios

### Test 11: Unauthorized Access

```bash
# Missing authentication
curl -X POST http://localhost:4000/api/messages \
  -H "Content-Type: application/json" \
  -d '{"chatId": "...", "clientMessageId": "...", "contentType": "text", "text": "test"}'

# Expected: 401 Unauthorized
```

### Test 12: User Not Member of Chat

```bash
curl -X POST http://localhost:4000/api/messages \
  -H "Authorization: Bearer $NON_MEMBER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"chatId\": \"$CHAT_ID\",
    \"clientMessageId\": \"test\",
    \"contentType\": \"text\",
    \"text\": \"This should fail\"
  }"

# Expected: 403 Forbidden
```

### Test 13: Invalid Content Type

```bash
curl -X POST http://localhost:4000/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"chatId\": \"$CHAT_ID\",
    \"clientMessageId\": \"test\",
    \"contentType\": \"text\",
    \"text\": \"\"
  }"

# Expected: 400 Bad Request - "Text content is required"
```

### Test 14: Message Not Found

```bash
curl -X GET http://localhost:4000/api/messages/nonexistent-id \
  -H "Authorization: Bearer $TOKEN"

# Expected: 404 Not Found
```

## Performance Testing

### Test 15: Pagination with Large Dataset

```bash
# Create 1000 messages
for i in {1..1000}; do
  curl -X POST http://localhost:4000/api/messages \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"chatId\": \"$CHAT_ID\",
      \"clientMessageId\": \"msg-$i\",
      \"contentType\": \"text\",
      \"text\": \"Message $i\"
    }"
done

# Fetch pages and measure response time
time curl -X GET "http://localhost:4000/api/messages?chatId=$CHAT_ID&limit=20" \
  -H "Authorization: Bearer $TOKEN"

# Expected: Response time < 100ms
```

## Automation Script (Bash)

```bash
#!/bin/bash

TOKEN="$1"
CHAT_ID="$2"

if [ -z "$TOKEN" ] || [ -z "$CHAT_ID" ]; then
  echo "Usage: ./test-messaging.sh <firebase-token> <chat-id>"
  exit 1
fi

echo "🧪 Testing Messaging API..."

# Test 1: Send message
echo "1️⃣  Testing send message..."
RESPONSE=$(curl -s -X POST http://localhost:4000/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"chatId\": \"$CHAT_ID\",
    \"clientMessageId\": \"test-$(date +%s)\",
    \"contentType\": \"text\",
    \"text\": \"Automated test message\"
  }")

MESSAGE_ID=$(echo "$RESPONSE" | jq -r '.data.id')
echo "✅ Message sent: $MESSAGE_ID"

# Test 2: Get message
echo "2️⃣  Testing get message..."
curl -s -X GET "http://localhost:4000/api/messages/$MESSAGE_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Test 3: Get history
echo "3️⃣  Testing message history..."
curl -s -X GET "http://localhost:4000/api/messages?chatId=$CHAT_ID&limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Test 4: Update receipt
echo "4️⃣  Testing receipt update..."
curl -s -X POST http://localhost:4000/api/messages/receipt/upsert \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"messageId\": \"$MESSAGE_ID\",
    \"chatId\": \"$CHAT_ID\",
    \"status\": \"seen\"
  }"
echo "✅ Receipt updated"

echo "🎉 All tests completed!"
```

**Run the script:**

```bash
chmod +x test-messaging.sh
./test-messaging.sh "$FIREBASE_TOKEN" "$CHAT_ID"
```

## Debugging Tips

### Enable Verbose Logging

```bash
# Backend
export DEBUG=nestjs:*,socket.io:*
npm run start:dev

# Frontend
localStorage.debug = "socket.io-client:*"
```

### Check Database State

```bash
# Connect to PostgreSQL
psql postgresql://user:password@localhost:5432/whatsapp_db

# View recent messages
SELECT id, chat_id, sender_id, text_content, created_at
FROM "Message"
ORDER BY created_at DESC
LIMIT 10;

# View receipts
SELECT message_id, recipient_id, delivered_at, seen_at
FROM "MessageReceipt"
WHERE seen_at IS NOT NULL;
```

### Simulate Network Issues

```bash
# Using Socket.IO client with simulated delays
socket.on("message:send", (payload) => {
  setTimeout(() => {
    socket.emit("message:send", payload);
  }, 5000); // 5 second delay
});
```

## Success Criteria

All tests should meet these criteria:

✅ Messages persist correctly  
✅ Idempotency prevents duplicates  
✅ Pagination works with large datasets  
✅ Receipts track delivery/seen status  
✅ Real-time broadcasts reach all users  
✅ Authorization prevents unauthorized access  
✅ Error handling returns appropriate status codes  
✅ Performance meets sub-100ms requirements
