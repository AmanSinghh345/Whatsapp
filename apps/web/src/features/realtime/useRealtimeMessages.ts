import { useEffect, useRef } from "react";
import { getSocket } from "./socket.client";
import type { MessageDto } from "../chat/api/messages.api";
import { upsertMessageReceipt } from "../chat/api/messages.api";

interface Options {
  chatId: string | null;
  currentUserId: string;
  onMessage: (msg: MessageDto) => void;
  onReceiptUpdate: (messageId: string, status: "delivered" | "seen") => void;
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
  onReceiptUpdate,
}: Options) {
  const onMessageRef = useRef(onMessage);
  const onReceiptUpdateRef = useRef(onReceiptUpdate);
  onMessageRef.current = onMessage;
  onReceiptUpdateRef.current = onReceiptUpdate;

  useEffect(() => {
    if (!chatId) return;

    let active = true;

    async function setup() {
      try {
        const socket = await getSocket();
        if (!active) return;

        const handler = (msg: MessageDto) => {
          if (msg.chatId !== chatId) return;

          console.log("[socket] message:new received:", msg);
          onMessageRef.current(msg);
          if (msg.senderId !== currentUserId) {
            void upsertMessageReceipt(msg.chatId, msg.id, "seen");
          }
        };

        const receiptHandler = (payload: ReceiptUpdatePayload) => {
          console.log("[socket] message:receipt:updated received:", payload);
          if (payload.recipientId !== currentUserId) {
            onReceiptUpdateRef.current(payload.messageId, payload.status);
          }
        };

        socket.on("message:new", handler);
        socket.on("message:receipt:updated", receiptHandler);

        // Cleanup
        return () => {
          socket.off("message:new", handler);
          socket.off("message:receipt:updated", receiptHandler);
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
