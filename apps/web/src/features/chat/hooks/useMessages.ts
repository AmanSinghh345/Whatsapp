// apps/web/src/features/chat/hooks/useMessages.ts

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchMessages, sendMessage, MessageDto } from "../api/messages.api";

export function useMessages(chatId: string | null) {
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
        if (!cancelled) setMessages(messages);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [chatId]);

  // Auto-scroll to latest message
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
        setMessages((prev) => [...prev, msg]);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSending(false);
      }
    },
    [chatId]
  );

  // Used later when Socket.IO pushes a new message
  const appendMessage = useCallback((msg: MessageDto) => {
    setMessages((prev) => {
      // Avoid duplicates (REST send + socket:new both arriving)
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  return { messages, loading, sending, error, send, appendMessage, bottomRef };
}