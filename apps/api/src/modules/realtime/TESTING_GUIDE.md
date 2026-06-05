# Socket.IO Implementation Testing Guide

## Quick Start Testing (3 steps)

### **Step 1: Build & Start Servers**

```bash
# Terminal 1 - Backend
cd apps/api
npm run build
npm run dev

# Terminal 2 - Frontend
cd apps/web
npm run dev
```

**Expected Output:**

```
Backend: API running on http://localhost:4000/api
Backend: WebSocket server running on ws://localhost:4000
Frontend: Ready in Xs
```

---

## 🔍 **Test Strategy 1: Health Check Endpoints**

### **Without Authentication**

```bash
# Check if API is running
curl http://localhost:4000/api/health

# Expected Response:
{
  "status": "ok",
  "timestamp": "2026-06-05T..."
}

# Check Socket.IO server status
curl http://localhost:4000/api/health/socket

# Expected Response:
{
  "status": "ok",
  "socketIO": {
    "connected": 0,
    "engine": 0,
    "namespace": "/"
  }
}
```

### **With Authentication** (After Login)

```bash
# Get your Firebase ID token from browser console:
const idToken = await auth.currentUser.getIdToken()
console.log(idToken)

# Use token to test authenticated endpoint:
curl -H "Authorization: Bearer YOUR_ID_TOKEN" \
  http://localhost:4000/api/health/me

# Expected Response:
{
  "user": {
    "firebaseUid": "abc123...",
    "email": "user@example.com",
    "displayName": "Your Name"
  },
  "authenticated": true
}

# Check your socket connections:
curl -H "Authorization: Bearer YOUR_ID_TOKEN" \
  http://localhost:4000/api/health/connections

# Expected Response:
{
  "totalConnections": 1,
  "yourConnections": ["socket-id-abc123"],
  "isOnline": true
}
```

---

## 🌐 **Test Strategy 2: Browser Network Inspection**

### **Steps**

1. Open **DevTools** (F12 or Ctrl+Shift+I)
2. Go to **Network** tab
3. Filter by **WS** (WebSocket)
4. Login on the app
5. Look for Socket.IO connection

### **Expected**

- **Request**: `ws://localhost:4000/socket.io/?...`
- **Status**: **101 Switching Protocols** ✅
- **Duration**: Should be established within 1-2 seconds

### **Headers Check**

Look in "Request Headers" → should show:

- `Authorization: Bearer <token>`
- Or `origin: http://localhost:3000`

---

## 💻 **Test Strategy 3: Browser Console Tests**

**After logging in**, run in console:

```javascript
import { socket, isSocketConnected, queryPresence } from "@/lib/socket";

// ✅ Test 1: Connection Status
console.log("✅ Connected:", isSocketConnected());
console.log("✅ Socket ID:", socket.id);
console.log("✅ User Data:", socket.data?.user);

// ✅ Test 2: Listen to Events
socket.on("message:new", (msg) => console.log("📨 New message:", msg));
socket.on("typing:state", (state) => console.log("⌨️ Typing:", state));
socket.on("presence:state", (users) => console.log("👥 Presence:", users));
socket.on("connect_error", (err) => console.error("❌ Error:", err));

// ✅ Test 3: Emit Events
// Test presence query
socket.emit("presence:query", {
  userIds: ["user-id-1", "user-id-2"],
});

// Watch for response
setTimeout(() => {
  console.log("Response received");
}, 1000);

// ✅ Test 4: Simulate Typing
socket.emit("typing:update", {
  chatId: "chat-123",
  isTyping: true,
  clientTs: new Date().toISOString(),
});

// After 3s, should auto-stop (TTL)
setTimeout(() => {
  socket.emit("typing:update", {
    chatId: "chat-123",
    isTyping: false,
    clientTs: new Date().toISOString(),
  });
}, 3000);

// ✅ Test 5: Check Message Emission
socket.emit("message:send", {
  chatId: "chat-123",
  clientMessageId: "msg-" + Date.now(),
  contentType: "text",
  textContent: "Hello, world!",
});
```

### **Expected Console Output**

```
✅ Connected: true
✅ Socket ID: abc-123-def
✅ User Data: { firebaseUid: "...", email: "...", displayName: "..." }
⌨️ Typing: { chatId: "...", typingUserIds: [...], updatedAt: "..." }
👥 Presence: [{ userId: "...", state: "online", updatedAt: "..." }]
```

---

## 📊 **Test Strategy 4: Multiple Tabs/Devices Test**

### **Steps**

1. Open **Tab A**: `http://localhost:3000` → Login
2. Open **Tab B**: `http://localhost:3000` → Login (different user or same)
3. In **Tab A** browser console:
   ```javascript
   socket.emit("typing:update", {
     chatId: "test-chat",
     isTyping: true,
     clientTs: new Date().toISOString(),
   });
   ```
4. Check **Tab B** console:
   ```javascript
   // You should see typing notification
   console.log("See if other tab's typing appears here");
   ```

### **Expected**

- Both tabs connected independently
- Events emitted from Tab A broadcast to Tab B
- Each has unique `socket.id`

---

## 🐛 **Common Issues & Debug**

### **Issue: Socket Not Connecting**

```javascript
socket.on("connect_error", (error) => {
  console.error("Connection error:", error.message);
  // Common issues:
  // "Missing authentication token" → Token not passed
  // "Invalid or expired token" → Token invalid/expired
  // "CORS policy" → Frontend/backend origin mismatch
});
```

### **Issue: Token Not Passed**

Check in Network tab → WS request headers → should have token in query params or auth header

### **Issue: Typing Not Broadcasting**

```javascript
// Verify you're in same chat room
socket.emit("typing:update", {
  chatId: "SAME-CHAT-ID", // ⚠️ Must match across tabs
  isTyping: true,
  clientTs: new Date().toISOString(),
});
```

---

## ✅ **Verification Checklist**

- [ ] Backend compiles: `npm run build` succeeds
- [ ] Frontend compiles: `npm run typecheck` succeeds
- [ ] `/api/health` returns 200 OK
- [ ] `/api/health/socket` returns connected count
- [ ] WebSocket upgrades to WSS/WS (Network tab shows 101)
- [ ] Browser console shows `✅ Connected: true`
- [ ] Events can be emitted without errors
- [ ] Multiple tabs can connect independently
- [ ] `isUserOnline()` returns correct status
- [ ] Typing TTL auto-expires after 3 seconds

---

## 🚀 **Next: Full Integration Test**

Once all above pass, test the full message flow:

1. **Implement Chat Service** (create/list chats)
2. **Implement Message Service** (send + persist)
3. **Test end-to-end**: Send message → See in both tabs

Would you like me to build these services? 🎯
