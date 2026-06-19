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

let typingListenerRefCount = 0;
let typingListenerCleanup: (() => void) | undefined;

export function useGlobalTypingListener() {
  useEffect(() => {
    let active = true;
    typingListenerRefCount += 1;

    if (typingListenerCleanup) {
      return () => {
        typingListenerRefCount -= 1;

        if (typingListenerRefCount <= 0) {
          typingListenerCleanup?.();
          typingListenerCleanup = undefined;
          typingListenerRefCount = 0;
        }
      };
    }

    void getSocket().then((socket) => {
      if (!active) return;

      const handler = (payload: TypingStatePayload) => {
        const { replaceTypingUsers, setTyping } = useTypingStore.getState();

        if ("typingUserIds" in payload) {
          replaceTypingUsers(payload.chatId, payload.typingUserIds);
          return;
        }

        setTyping(payload.chatId, payload.userId, payload.isTyping);
      };

      socket.off("typing:state", handler);
      socket.on("typing:state", handler);
      typingListenerCleanup = () => socket.off("typing:state", handler);
    });

    return () => {
      active = false;
      typingListenerRefCount -= 1;

      if (typingListenerRefCount <= 0) {
        typingListenerCleanup?.();
        typingListenerCleanup = undefined;
        typingListenerRefCount = 0;
      }
    };
  }, []);
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
