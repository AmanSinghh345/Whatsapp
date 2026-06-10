import { useEffect, useRef, useCallback } from "react";
import { getSocket } from "./socket.client";

export function useTyping(chatId: string | null, currentUserId: string) {
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const sendTyping = useCallback(
    async (isTyping: boolean) => {
      if (!chatId) return;
      try {
        const socket = await getSocket();
        socket.emit("typing:update", {
          chatId,
          isTyping,
          clientTs: new Date().toISOString(),
        });
        console.log("[typing] emitted typing:update", {
          chatId,
          currentUserId,
          isTyping,
        });
        isTypingRef.current = isTyping;
      } catch (e) {
        // non-fatal
      }
    },
    [chatId, currentUserId]
  );

  const onKeyStroke = useCallback(() => {
    // Start typing if not already
    if (!isTypingRef.current) {
      void sendTyping(true);
    }

    // Reset the stop-typing timer on every keystroke
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      void sendTyping(false);
    }, 2000); // stop typing after 2s of no keystrokes
  }, [sendTyping]);

  // Cleanup on unmount or chat change
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (isTypingRef.current) {
        void sendTyping(false);
      }
    };
  }, [chatId, sendTyping]);

  return { onKeyStroke };
}
