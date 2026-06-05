import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchMessages,
  sendMessage,
  upsertMessageReceipt,
  MessageDto,
} from "../api/messages.api";

export function useMessages(chatId: string | null, currentUserId: string) {
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchMessages(chatId)
      .then(({ messages }) => {
        if (cancelled) return;

        setMessages(messages);
        const incomingMessages = messages.filter(
          (message) => message.senderId !== currentUserId,
        );
        void Promise.allSettled(
          incomingMessages.map((message) =>
            upsertMessageReceipt(chatId, message.id, "seen"),
          ),
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chatId, currentUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      if (!chatId || !text.trim()) return;
      setSending(true);
      setError(null);
      try {
        const msg = await sendMessage(chatId, text.trim());
        // Dedup — socket broadcast may have already added this message
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSending(false);
      }
    },
    [chatId]
  );

  const appendMessage = useCallback((msg: MessageDto) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const updateReceiptStatus = useCallback(
    (messageId: string, status: "delivered" | "seen") => {
      setMessages((prev) =>
        prev.map((message) => {
          if (message.id !== messageId) {
            return message;
          }

          if (message.receiptStatus === "seen") {
            return message;
          }

          return { ...message, receiptStatus: status };
        }),
      );
    },
    [],
  );

  return {
    messages,
    loading,
    sending,
    error,
    send,
    appendMessage,
    updateReceiptStatus,
    bottomRef,
  };
}
