import { useEffect, useState } from "react";
import { getSocket } from "./socket.client";

interface TypingStatePayload {
  chatId: string;
  typingUserIds: string[];
  updatedAt: string;
}

export function useTypingIndicator(
  chatId: string | null,
  currentUserId: string
) {
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (!chatId) {
      setTypingUserIds([]);
      return;
    }

    let active = true;

    getSocket().then((socket) => {
      if (!active) return;

      const handler = (payload: TypingStatePayload) => {
        if (payload.chatId !== chatId) return;
        // Filter out current user — don't show own typing indicator
        setTypingUserIds(
          payload.typingUserIds.filter((id) => id !== currentUserId)
        );
      };

      socket.on("typing:state", handler);

      return () => {
        socket.off("typing:state", handler);
      };
    });

    return () => {
      active = false;
      setTypingUserIds([]);
    };
  }, [chatId, currentUserId]);

  return { isTyping: typingUserIds.length > 0, typingUserIds };
}