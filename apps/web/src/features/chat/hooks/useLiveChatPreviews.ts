"use client";

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ChatDto } from "@chat/shared";
import type { MessageDto } from "../api/messages.api";
import { upsertMessageReceipt } from "../api/messages.api";
import { getSocket } from "../../realtime/socket.client";

type UseLiveChatPreviewsOptions<TChat extends ChatDto> = {
  currentUserId?: string | null | undefined;
  selectedChatId: string | null;
  setChats: Dispatch<SetStateAction<TChat[]>>;
};

function getMessagePreview(message: MessageDto) {
  if (message.deletedAt) {
    return "This message was deleted";
  }

  if (message.contentType === "system") {
    return message.text ?? "Call activity";
  }

  if (message.contentType === "attachment") {
    return message.text ?? "Attachment";
  }

  if (message.contentType === "game") {
    return message.text ?? "Game";
  }

  return message.text ?? "Message";
}

function getChatSortTime(chat: ChatDto) {
  return new Date(chat.lastMessageAt ?? chat.updatedAt).getTime();
}

function sortChatsByRecent<TChat extends ChatDto>(chats: TChat[]) {
  return [...chats].sort((a, b) => getChatSortTime(b) - getChatSortTime(a));
}

export function useLiveChatPreviews<TChat extends ChatDto>({
  currentUserId,
  selectedChatId,
  setChats,
}: UseLiveChatPreviewsOptions<TChat>) {
  useEffect(() => {
    if (!selectedChatId) {
      return;
    }

    setChats((current) =>
      current.map((chat) =>
        chat.id === selectedChatId ? { ...chat, unreadCount: 0 } : chat,
      ),
    );
  }, [selectedChatId, setChats]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    let active = true;
    let cleanup: (() => void) | undefined;

    void getSocket().then((socket) => {
      if (!active) return;

      const onMessage = (payload: MessageDto | { message: MessageDto }) => {
        const message = "message" in payload ? payload.message : payload;

        if (message.senderId !== currentUserId) {
          void upsertMessageReceipt(
            message.chatId,
            message.id,
            message.chatId === selectedChatId ? "seen" : "delivered",
          ).catch((error) => {
            console.warn("[receipt] preview update failed:", error);
          });
        }

        setChats((current) => {
          let changed = false;
          const next = current.map((chat) => {
            if (chat.id !== message.chatId) {
              return chat;
            }

            changed = true;
            const shouldIncrementUnread =
              message.senderId !== currentUserId &&
              message.chatId !== selectedChatId;

            return {
              ...chat,
              lastMessagePreview: getMessagePreview(message),
              lastMessageAt: message.createdAt,
              updatedAt: message.createdAt,
              unreadCount: shouldIncrementUnread
                ? (chat.unreadCount ?? 0) + 1
                : message.chatId === selectedChatId
                  ? 0
                  : (chat.unreadCount ?? 0),
            };
          });

          return changed ? sortChatsByRecent(next) : current;
        });
      };

      const onMessageEdited = (payload: { chatId: string; message: MessageDto }) => {
        setChats((current) =>
          current.map((chat) => {
            if (
              chat.id !== payload.chatId ||
              chat.lastMessageAt !== payload.message.createdAt
            ) {
              return chat;
            }

            return {
              ...chat,
              lastMessagePreview: getMessagePreview(payload.message),
            };
          }),
        );
      };

      const onMessageDeleted = (payload: { chatId: string; message: MessageDto }) => {
        setChats((current) =>
          current.map((chat) => {
            if (
              chat.id !== payload.chatId ||
              chat.lastMessageAt !== payload.message.createdAt
            ) {
              return chat;
            }

            return {
              ...chat,
              lastMessagePreview: getMessagePreview(payload.message),
            };
          }),
        );
      };

      socket.off("message:new", onMessage);
      socket.off("message:edited", onMessageEdited);
      socket.off("message:deleted", onMessageDeleted);
      socket.on("message:new", onMessage);
      socket.on("message:edited", onMessageEdited);
      socket.on("message:deleted", onMessageDeleted);
      cleanup = () => {
        socket.off("message:new", onMessage);
        socket.off("message:edited", onMessageEdited);
        socket.off("message:deleted", onMessageDeleted);
      };
    });

    return () => {
      active = false;
      cleanup?.();
    };
  }, [currentUserId, selectedChatId, setChats]);
}
