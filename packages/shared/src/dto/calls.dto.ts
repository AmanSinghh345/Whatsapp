import type { Id, ISODateString } from "../types/index.js";

export type CallStatus = "created" | "ringing" | "active" | "ended" | "missed";

export type CallSessionDto = {
  id: Id;
  chatId?: Id;
  createdById: Id;
  status: CallStatus;
  createdAt: ISODateString;
  startedAt?: ISODateString;
  endedAt?: ISODateString;
};

export type WebRtcSignalType = "offer" | "answer" | "ice-candidate";

export type WebRtcSignalDto = {
  callId: Id;
  toUserId: Id;
  type: WebRtcSignalType;
  sdp?: string;
  candidate?: unknown;
};

