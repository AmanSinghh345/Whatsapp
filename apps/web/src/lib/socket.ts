import { io, type Socket } from "socket.io-client";
import { SocketEvents as SocketEventsType } from "@chat/shared";
import type {
  ClientToServerEvents,
  TypingUpdatePayload,
  PresenceQueryPayload,
  SendMessageRequestDto,
  UpsertReceiptDto,
  WebRtcSignalDto,
} from "@chat/shared";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace("/api", "") ??
  "http://localhost:4000";

export const socket: Socket<Record<string, any>, ClientToServerEvents> = io(
  apiBaseUrl,
  {
    autoConnect: false,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  },
);

/**
 * Connect socket with Firebase ID token
 */
export async function connectSocket(idToken: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.auth = { token: idToken };

    socket.connect();

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
      resolve();
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
      reject(error);
    });

    // Timeout after 10s
    setTimeout(() => {
      if (!socket.connected) {
        reject(new Error("Socket connection timeout"));
      }
    }, 10000);
  });
}

/**
 * Disconnect socket
 */
export function disconnectSocket(): void {
  if (socket.connected) {
    socket.disconnect();
  }
}

/**
 * Join a chat room
 */
export function joinChatRoom(chatId: string): void {
  socket.emit("chat:join", { chatId });
  console.log(`Joined chat room: ${chatId}`);
}

/**
 * Leave a chat room
 */
export function leaveChatRoom(chatId: string): void {
  socket.emit("chat:leave", { chatId });
  console.log(`Left chat room: ${chatId}`);
}

/**
 * Send a message
 */
export function sendMessage(payload: SendMessageRequestDto): void {
  socket.emit(SocketEventsType.messageSend, payload);
}

/**
 * Upsert message receipt (mark as delivered/seen)
 */
export function upsertMessageReceipt(payload: UpsertReceiptDto): void {
  socket.emit(SocketEventsType.messageReceiptUpsert, payload);
}

/**
 * Update typing indicator
 */
export function updateTyping(payload: TypingUpdatePayload): void {
  socket.emit(SocketEventsType.typingUpdate, payload);
}

/**
 * Query presence of users
 */
export function queryPresence(payload: PresenceQueryPayload): void {
  socket.emit(SocketEventsType.presenceQuery, payload);
}

/**
 * Send WebRTC signal (for calls)
 */
export function sendWebRtcSignal(payload: WebRtcSignalDto): void {
  socket.emit(SocketEventsType.callSignal, payload);
}

/**
 * Join a call
 */
export function joinCall(callId: string): void {
  socket.emit(SocketEventsType.callJoin, { callId });
}

/**
 * Leave a call
 */
export function leaveCall(callId: string): void {
  socket.emit(SocketEventsType.callLeave, { callId });
}

/**
 * Check if socket is connected
 */
export function isSocketConnected(): boolean {
  return socket.connected;
}
