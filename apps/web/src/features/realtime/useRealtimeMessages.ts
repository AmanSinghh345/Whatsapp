import { useEffect, useRef } from "react";
import { getSocket, joinChatOnce } from "./socket.client";
import type {
  MessageDeletedDto,
  MessageEditedDto,
  MessageDto,
  MessageReactionUpdatedDto,
  MessageReceiptUpdatedDto,
} from "../chat/api/messages.api";
import { upsertMessageReceipt } from "../chat/api/messages.api";

interface Options {
  chatId: string | null;
  currentUserId: string;
  onMessage: (msg: MessageDto) => void;
  onMessageEdited?: (msg: MessageDto) => void;
  onMessageDeleted?: (msg: MessageDto) => void;
  onReceiptUpdate: (payload: MessageReceiptUpdatedDto) => void;
  onReactionUpdate: (
    messageId: string,
    reactions: MessageReactionUpdatedDto["reactions"],
  ) => void;
}

export function useRealtimeMessages({
  chatId,
  currentUserId,
  onMessage,
  onMessageEdited,
  onMessageDeleted,
  onReceiptUpdate,
  onReactionUpdate,
}: Options) {
  const onMessageRef = useRef(onMessage);
  const onMessageEditedRef = useRef(onMessageEdited);
  const onMessageDeletedRef = useRef(onMessageDeleted);
  const onReceiptUpdateRef = useRef(onReceiptUpdate);
  const onReactionUpdateRef = useRef(onReactionUpdate);
  onMessageRef.current = onMessage;
  onMessageEditedRef.current = onMessageEdited;
  onMessageDeletedRef.current = onMessageDeleted;
  onReceiptUpdateRef.current = onReceiptUpdate;
  onReactionUpdateRef.current = onReactionUpdate;

  useEffect(() => {
    if (!chatId) return;

    let active = true;
    const activeChatId = chatId;

    async function setup() {
      try {
        const socket = await getSocket();
        if (!active) return;

        const joinActiveChat = () => {
          void joinChatOnce(activeChatId);
        };

        joinActiveChat();
        socket.off("connect", joinActiveChat);
        socket.on("connect", joinActiveChat);

        const handler = (payload: MessageDto | { message: MessageDto }) => {
          const msg = "message" in payload ? payload.message : payload;
          if (msg.chatId !== activeChatId) return;

          onMessageRef.current(msg);
          if (msg.senderId !== currentUserId) {
            void upsertMessageReceipt(msg.chatId, msg.id, "seen").catch(
              (error) => {
                console.warn("[receipt] seen update failed:", error);
              },
            );
          }
        };

        const receiptHandler = (payload: MessageReceiptUpdatedDto) => {
          if (payload.chatId !== activeChatId) return;

          if (payload.recipientId !== currentUserId) {
            onReceiptUpdateRef.current(payload);
          }
        };

        const editHandler = (payload: MessageEditedDto) => {
          if (payload.chatId !== activeChatId) return;
          onMessageEditedRef.current?.(payload.message);
        };

        const deleteHandler = (payload: MessageDeletedDto) => {
          if (payload.chatId !== activeChatId) return;
          onMessageDeletedRef.current?.(payload.message);
        };

        const reactionHandler = (payload: MessageReactionUpdatedDto) => {
          console.log("[reaction] event received", payload);
          if (payload.chatId !== activeChatId) return;
          onReactionUpdateRef.current(payload.messageId, payload.reactions);
        };

        socket.off("message:new", handler);
        socket.off("message:edited", editHandler);
        socket.off("message:deleted", deleteHandler);
        socket.off("message:receipt:updated", receiptHandler);
        socket.off("message:reactionUpdated", reactionHandler);
        socket.on("message:new", handler);
        socket.on("message:edited", editHandler);
        socket.on("message:deleted", deleteHandler);
        socket.on("message:receipt:updated", receiptHandler);
        socket.on("message:reactionUpdated", reactionHandler);

        // Cleanup
        return () => {
          socket.off("connect", joinActiveChat);
          socket.off("message:new", handler);
          socket.off("message:edited", editHandler);
          socket.off("message:deleted", deleteHandler);
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
