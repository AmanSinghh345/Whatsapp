"use client";

import { useEffect, useRef } from "react";
import type { CallSessionDto, ChatDto } from "@chat/shared";
import type { MessageDto } from "../chat/api/messages.api";
import { getChatTitle } from "../chat/components/chat-display";
import { canShowBrowserNotification } from "./notifications";
import { getSocket } from "./socket.client";

type CallCreatedPayload = {
  call: CallSessionDto;
  chat?: ChatDto;
};

type UseBrowserNotificationsOptions = {
  chats: ChatDto[];
  currentUserId?: string | null | undefined;
  selectedChatId?: string | null | undefined;
  onSelectChat?: (chatId: string) => void;
};

function shouldNotifyForChat(chatId: string, selectedChatId?: string | null) {
  if (typeof document === "undefined") {
    return false;
  }

  return document.hidden || chatId !== selectedChatId;
}

function getMessageBody(message: MessageDto) {
  if (message.contentType === "system") {
    return message.text ?? "New activity";
  }

  if (message.contentType === "attachment") {
    return message.text ?? "Sent an attachment";
  }

  return message.text ?? "New message";
}

export function useBrowserNotifications({
  chats,
  currentUserId,
  selectedChatId,
  onSelectChat,
}: UseBrowserNotificationsOptions) {
  const chatsRef = useRef(chats);
  const selectedChatIdRef = useRef(selectedChatId);
  const onSelectChatRef = useRef(onSelectChat);

  chatsRef.current = chats;
  selectedChatIdRef.current = selectedChatId;
  onSelectChatRef.current = onSelectChat;

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    let active = true;
    let cleanup: (() => void) | undefined;

    const showNotification = ({
      title,
      body,
      chatId,
      tag,
    }: {
      title: string;
      body: string;
      chatId: string;
      tag: string;
    }) => {
      if (!canShowBrowserNotification()) {
        return;
      }

      const notification = new Notification(title, {
        body,
        tag,
        icon: "/favicon.ico",
      });

      notification.onclick = () => {
        window.focus();
        onSelectChatRef.current?.(chatId);
        notification.close();
      };
    };

    void getSocket().then((socket) => {
      if (!active) return;

      const onMessage = (message: MessageDto) => {
        if (message.senderId === currentUserId) {
          return;
        }

        if (!shouldNotifyForChat(message.chatId, selectedChatIdRef.current)) {
          return;
        }

        const chat = chatsRef.current.find((item) => item.id === message.chatId);
        const title = chat
          ? getChatTitle(chat, currentUserId)
          : "New message";

        showNotification({
          title,
          body: getMessageBody(message),
          chatId: message.chatId,
          tag: `message:${message.chatId}`,
        });
      };

      const onCallCreated = (payload: CallCreatedPayload) => {
        if (payload.call.receiverId !== currentUserId) {
          return;
        }

        const chat =
          payload.chat ??
          chatsRef.current.find((item) => item.id === payload.call.chatId);
        const chatId = payload.call.chatId;

        if (!chatId) {
          return;
        }

        if (!shouldNotifyForChat(chatId, selectedChatIdRef.current)) {
          return;
        }

        showNotification({
          title: chat ? getChatTitle(chat, currentUserId) : "Incoming call",
          body: "Incoming video call",
          chatId,
          tag: `call:${payload.call.id}`,
        });
      };

      socket.on("message:new", onMessage);
      socket.on("call:created", onCallCreated);

      cleanup = () => {
        socket.off("message:new", onMessage);
        socket.off("call:created", onCallCreated);
      };
    });

    return () => {
      active = false;
      cleanup?.();
    };
  }, [currentUserId]);
}
