"use client";

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ChatDto } from "@chat/shared";
import type { MessageDto } from "../api/messages.api";
import { getSocket } from "../../realtime/socket.client";

type UseLiveChatPreviewsOptions<TChat extends ChatDto> = {
  currentUserId?: string | null | undefined;
  selectedChatId: string | null;
  setChats: Dispatch<SetStateAction<TChat[]>>;
};

function getMessagePreview(message: MessageDto) {
  if (message.contentType === "system") {
    return message.text ?? "Call activity";
  }

  if (message.contentType === "attachment") {
    return message.text ?? "Attachment";
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

      const onMessage = (message: MessageDto) => {
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

      socket.on("message:new", onMessage);
      cleanup = () => socket.off("message:new", onMessage);
    });

    return () => {
      active = false;
      cleanup?.();
    };
  }, [currentUserId, selectedChatId, setChats]);
}
