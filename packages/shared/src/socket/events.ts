export const SocketEvents = {
  messageSend: "message:send",
  messageNew: "message:new",
  messageEdited: "message:edited",
  messageDeleted: "message:deleted",
  messageReceiptUpsert: "message:receipt:upsert",
  messageReceiptUpdated: "message:receipt:updated",
  messageReactionUpdated: "message:reactionUpdated",

  typingUpdate: "typing:update",
  typingState: "typing:state",

  presenceQuery: "presence:query",
  presenceState: "presence:state",
  presenceOnline: "presence:online",
  presenceOffline: "presence:offline",

  unreadChanged: "notifications:unreadChanged",

  callCreated: "call:created",
  callJoin: "call:join",
  callLeave: "call:leave",
  callSignal: "call:signal",
  callState: "call:state"
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];
