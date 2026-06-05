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

        console.log("[socket] joining chat room:", chatId);
        socket.emit("chat:join", { chatId });

        const handler = (msg: MessageDto) => {
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
          socket.emit("chat:leave", { chatId });
          console.log("[socket] left chat room:", chatId);
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
