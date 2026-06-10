import type { ChatDto } from "../dto/chats.dto.js";
import type { MessageDto, SendMessageRequestDto, UpsertReceiptDto } from "../dto/messages.dto.js";
import type { CallSessionDto, WebRtcSignalDto } from "../dto/calls.dto.js";
import type { Id, ISODateString } from "../types/index.js";

export type TypingUpdatePayload = {
  chatId: Id;
  isTyping: boolean;
  clientTs: ISODateString;
};

export type TypingStatePayload = {
  chatId: Id;
  userId: Id;
  isTyping: boolean;
  updatedAt: ISODateString;
};

export type PresenceState = "online" | "offline";

export type PresenceStatePayload = {
  userId: Id;
  state: PresenceState;
  lastSeenAt?: ISODateString;
  updatedAt: ISODateString;
};

export type PresenceQueryPayload = {
  userIds: Id[];
};

export type UnreadChangedPayload = {
  chatId: Id;
  unreadCount: number;
  lastReadAt?: ISODateString;
};

// Client -> Server events
export type ClientToServerEvents = {
  "message:send": (payload: SendMessageRequestDto) => void;
  "message:receipt:upsert": (payload: UpsertReceiptDto) => void;

  "chat:join": (payload: { chatId: Id }) => void;
  "chat:leave": (payload: { chatId: Id }) => void;

  "typing:update": (payload: TypingUpdatePayload) => void;
  "presence:query": (payload: PresenceQueryPayload) => void;

  "call:join": (payload: { callId: Id }) => void;
  "call:leave": (payload: { callId: Id }) => void;
  "call:signal": (payload: WebRtcSignalDto) => void;
};

// Server -> Client events
export type ServerToClientEvents = {
  "message:new": (payload: { message: MessageDto }) => void;
  "message:receipt:updated": (payload: { messageId: Id; recipientId: Id; deliveredAt?: ISODateString; seenAt?: ISODateString }) => void;

  "typing:state": (payload: TypingStatePayload) => void;

  "presence:state": (payload: PresenceStatePayload[]) => void;
  "presence:online": (payload: PresenceStatePayload) => void;
  "presence:offline": (payload: PresenceStatePayload) => void;

  "notifications:unreadChanged": (payload: UnreadChangedPayload) => void;

  "call:created": (payload: { call: CallSessionDto; chat?: ChatDto }) => void;
  "call:state": (payload: { call: CallSessionDto }) => void;
  "call:signal": (payload: WebRtcSignalDto & { fromUserId: Id }) => void;
};
