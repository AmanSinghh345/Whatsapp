"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMessages } from "../hooks/useMessages";
import { useRealtimeMessages } from "../../realtime/useRealtimeMessages";
import { useTyping } from "../../realtime/useTyping";
import { useTypingStore } from "../../realtime/typing.store";
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
    editingMessageId,
    deletingMessageId,
    error,
    send,
    sendAttachment,
    appendMessage,
    updateMessage,
    updateReceiptStatus,
    updateMessageReactions,
    reactToMessage,
    edit,
    deleteMessage,
    pendingReactionMessageIds,
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
    onMessageEdited: updateMessage,
    onMessageDeleted: updateMessage,
    onReceiptUpdate: updateReceiptStatus,
    onReactionUpdate: updateMessageReactions,
  });

  const { onKeyStroke } = useTyping(chatId, currentUserId);
  const typingByChatId = useTypingStore((state) => state.typingByChatId);
  const typingUserIds = (typingByChatId[chatId] ?? []).filter(
    (id) => id !== currentUserId,
  );
  const isTyping = typingUserIds.length > 0;
  const typingNames = typingUserIds.map((userId) => {
    const member = chat?.members?.find((item) => item.userId === userId);
    return member?.user?.displayName ?? "Someone";
  });
  const typingLabel =
    typingNames.length === 1
      ? `${typingNames[0]} is typing...`
      : `${typingNames.length} people are typing...`;

  useEffect(() => {
    if (!highlightedMessageId) return;

    messageRefs.current[highlightedMessageId]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [highlightedMessageId, messages]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#101114]">
      <MessageList
        chat={chat}
        messages={messages}
        currentUserId={currentUserId}
        loading={loading}
        typing={isTyping}
        typingLabel={typingLabel}
        onReact={reactToMessage}
        onEdit={edit}
        onDelete={deleteMessage}
        pendingReactionMessageIds={pendingReactionMessageIds}
        editingMessageId={editingMessageId}
        deletingMessageId={deletingMessageId}
        highlightedMessageId={highlightedMessageId}
        bottomRef={bottomRef}
        messageRefs={messageRefs}
      />

      {error && (
        <div className="mx-5 mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
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
