"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMessages } from "../hooks/useMessages";
import { useRealtimeMessages } from "../../realtime/useRealtimeMessages";
import { useTyping } from "../../realtime/useTyping";
import { useTypingIndicator } from "../../realtime/useTypingIndicator";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";
import type { ChatDto } from "@chat/shared";

interface Props {
  chatId: string;
  currentUserId: string;
  chat?: ChatDto | null;
  highlightedMessageId?: string | null;
}

export function MessageThread({
  chatId,
  currentUserId,
  chat = null,
  highlightedMessageId = null,
}: Props) {
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const {
    messages,
    loading,
    sending,
    error,
    send,
    sendAttachment,
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

  useEffect(() => {
    if (!highlightedMessageId) return;

    messageRefs.current[highlightedMessageId]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [highlightedMessageId, messages]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <MessageList
        chat={chat}
        messages={messages}
        currentUserId={currentUserId}
        loading={loading}
        typing={isTyping}
        highlightedMessageId={highlightedMessageId}
        bottomRef={bottomRef}
        messageRefs={messageRefs}
      />

      {error && (
        <div className="mx-4 mb-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <MessageComposer
        onSend={send}
        onAttach={sendAttachment}
        onKeyStroke={onKeyStroke}
        disabled={sending}
      />
    </div>
  );
}
