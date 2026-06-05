"use client";

import { useCallback } from "react";
import { useMessages } from "../hooks/useMessages";
import { useRealtimeMessages } from "../../realtime/useRealtimeMessages";
import { useTyping } from "../../realtime/useTyping";
import { useTypingIndicator } from "../../realtime/useTypingIndicator";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { TypingBubble } from "./TypingBubble";

interface Props {
  chatId: string;
  currentUserId: string;
}

export function MessageThread({ chatId, currentUserId }: Props) {
  const {
    messages,
    loading,
    sending,
    error,
    send,
    appendMessage,
    updateReceiptStatus,
    bottomRef,
  } = useMessages(chatId, currentUserId);

  const handleIncoming = useCallback(
    (msg: typeof messages[number]) => appendMessage(msg),
    [appendMessage]
  );

  useRealtimeMessages({
    chatId,
    currentUserId,
    onMessage: handleIncoming,
    onReceiptUpdate: updateReceiptStatus,
  });

  const { onKeyStroke } = useTyping(chatId, currentUserId);
  const { isTyping } = useTypingIndicator(chatId, currentUserId);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="relative flex flex-1 flex-col overflow-y-auto bg-zinc-950">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-55"
          style={{
            backgroundImage:
              "url('/images/chat-backgrounds/gradient-landscape.avif')",
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_34%),linear-gradient(135deg,rgba(9,9,11,0.58),rgba(9,9,11,0.34)_45%,rgba(2,6,23,0.62))]" />
        <div className="pointer-events-none absolute inset-0 backdrop-blur-[1px]" />

        <div className="relative z-10 flex flex-1 flex-col gap-1 px-6 py-4">
          {loading && (
            <p className="mt-10 text-center text-sm text-white/40">
            Loading messages…
          </p>
          )}

          {!loading && messages.length === 0 && (
            <p className="mt-10 text-center text-sm text-white/40">
            No messages yet. Say hello! 👋
          </p>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.senderId === currentUserId}
            />
          ))}

          {isTyping && <TypingBubble />}

          <div ref={bottomRef} />
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          ⚠️ {error}
        </div>
      )}

      <MessageInput
        onSend={send}
        onKeyStroke={onKeyStroke}
        disabled={sending}
      />
    </div>
  );
}
