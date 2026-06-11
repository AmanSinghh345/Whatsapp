import { useEffect, useRef } from "react";
import { getSocket } from "./socket.client";
import type {
  MessageEditedDto,
  MessageDto,
  MessageReactionUpdatedDto,
} from "../chat/api/messages.api";
import { upsertMessageReceipt } from "../chat/api/messages.api";

interface Options {
  chatId: string | null;
  currentUserId: string;
  onMessage: (msg: MessageDto) => void;
  onMessageEdited?: (msg: MessageDto) => void;
  onReceiptUpdate: (messageId: string, status: "delivered" | "seen") => void;
  onReactionUpdate: (
    messageId: string,
    reactions: MessageReactionUpdatedDto["reactions"],
  ) => void;
}

type ReceiptUpdatePayload = {
  messageId: string;
  recipientId: string;
  status: "delivered" | "seen";
};

export function useRealtimeMessages({
  chatId,
  currentUserId,
  onMessage,
  onMessageEdited,
  onReceiptUpdate,
  onReactionUpdate,
}: Options) {
  const onMessageRef = useRef(onMessage);
  const onMessageEditedRef = useRef(onMessageEdited);
  const onReceiptUpdateRef = useRef(onReceiptUpdate);
  const onReactionUpdateRef = useRef(onReactionUpdate);
  onMessageRef.current = onMessage;
  onMessageEditedRef.current = onMessageEdited;
  onReceiptUpdateRef.current = onReceiptUpdate;
  onReactionUpdateRef.current = onReactionUpdate;

  useEffect(() => {
    if (!chatId) return;

    let active = true;

    async function setup() {
      try {
        const socket = await getSocket();
        if (!active) return;

        const joinActiveChat = () => {
          socket.emit("chat:join", { chatId });
        };

        joinActiveChat();
        socket.on("connect", joinActiveChat);

        const handler = (msg: MessageDto) => {
          if (msg.chatId !== chatId) return;

          onMessageRef.current(msg);
          if (msg.senderId !== currentUserId) {
            void upsertMessageReceipt(msg.chatId, msg.id, "seen");
          }
        };

        const receiptHandler = (payload: ReceiptUpdatePayload) => {
          if (payload.recipientId !== currentUserId) {
            onReceiptUpdateRef.current(payload.messageId, payload.status);
          }
        };

        const editHandler = (payload: MessageEditedDto) => {
          if (payload.chatId !== chatId) return;
          onMessageEditedRef.current?.(payload.message);
        };

        const reactionHandler = (payload: MessageReactionUpdatedDto) => {
          console.log("[reaction] event received", payload);
          if (payload.chatId !== chatId) return;
          onReactionUpdateRef.current(payload.messageId, payload.reactions);
        };

        socket.on("message:new", handler);
        socket.on("message:edited", editHandler);
        socket.on("message:receipt:updated", receiptHandler);
        socket.on("message:reactionUpdated", reactionHandler);

        // Cleanup
        return () => {
          socket.off("connect", joinActiveChat);
          socket.off("message:new", handler);
          socket.off("message:edited", editHandler);
          socket.off("message:receipt:updated", receiptHandler);
          socket.off("message:reactionUpdated", reactionHandler);
        };
      } catch (err) {
        console.error("[socket] setup failed:", err);
      }
    }

    const cleanupPromise = setup();

    return () => {
      active = false;
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [chatId, currentUserId]);
}
