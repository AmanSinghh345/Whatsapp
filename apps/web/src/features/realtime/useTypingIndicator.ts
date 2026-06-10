import { useEffect } from "react";
import { getSocket } from "./socket.client";
import { useTypingStore } from "./typing.store";

type TypingStatePayload =
  | {
      chatId: string;
      typingUserIds: string[];
      updatedAt: string;
    }
  | {
      chatId: string;
      userId: string;
      isTyping: boolean;
      updatedAt: string;
    };

export function useGlobalTypingListener() {
  const setTyping = useTypingStore((state) => state.setTyping);
  const replaceTypingUsers = useTypingStore((state) => state.replaceTypingUsers);

  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;

    void getSocket().then((socket) => {
      if (!active) return;

      const handler = (payload: TypingStatePayload) => {
        console.log("[typing] received typing:state", payload);

        if ("typingUserIds" in payload) {
          replaceTypingUsers(payload.chatId, payload.typingUserIds);
          return;
        }

        setTyping(payload.chatId, payload.userId, payload.isTyping);
      };

      socket.on("typing:state", handler);
      cleanup = () => socket.off("typing:state", handler);
    });

    return () => {
      active = false;
      cleanup?.();
    };
  }, [replaceTypingUsers, setTyping]);
}

export function useTypingIndicator(
  chatId: string | null,
  currentUserId: string,
) {
  useGlobalTypingListener();

  const typingByChatId = useTypingStore((state) => state.typingByChatId);
  const typingUserIds = chatId
    ? (typingByChatId[chatId] ?? []).filter((id) => id !== currentUserId)
    : [];

  return { isTyping: typingUserIds.length > 0, typingUserIds };
}
