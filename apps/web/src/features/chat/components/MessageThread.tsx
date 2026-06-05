// apps/web/src/features/chat/components/MessageThread.tsx
"use client";

import { useMessages } from "../hooks/useMessages";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";

interface Props {
  chatId: string;
  currentUserId: string;
}

export function MessageThread({ chatId, currentUserId }: Props) {
  const { messages, loading, sending, error, send, bottomRef } =
    useMessages(chatId);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages scroll area */}
      <div className="flex flex-col flex-1 overflow-y-auto px-6 py-4 gap-1">
        {loading && (
          <p className="text-center text-sm text-white/40 mt-10">
            Loading messages…
          </p>
        )}

        {!loading && messages.length === 0 && (
          <p className="text-center text-sm text-white/40 mt-10">
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

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          ⚠️ {error}
        </div>
      )}

      <MessageInput onSend={send} disabled={sending} />
    </div>
  );
}