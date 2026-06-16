"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMessages } from "../hooks/useMessages";
import { useRealtimeMessages } from "../../realtime/useRealtimeMessages";
import { useTyping } from "../../realtime/useTyping";
import { useTypingStore } from "../../realtime/typing.store";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";
import type { ChatDto } from "@chat/shared";
import { getUserLabel } from "./chat-display";

interface Props {
  chatId: string;
  currentUserId: string;
  chat?: ChatDto | null;
  highlightedMessageId?: string | null;
}

type ImagePreview = {
  url: string;
  name: string;
  size: string;
};

function ImagePreviewModal({
  image,
  onClose,
}: {
  image: ImagePreview;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#101114] shadow-2xl shadow-black/50"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">
              {image.name || "Image attachment"}
            </p>
            {image.size ? (
              <p className="mt-0.5 text-xs text-slate-500">{image.size}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={image.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/[0.09]"
            >
              Open
            </a>
            <a
              href={image.url}
              download
              className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-100 transition hover:bg-emerald-500/20"
            >
              Download
            </a>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-slate-300 transition hover:bg-white/[0.09] hover:text-white"
              aria-label="Close image preview"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black/25 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt=""
            className="max-h-[78dvh] max-w-full rounded-2xl object-contain shadow-2xl shadow-black/40"
          />
        </div>
      </div>
    </div>
  );
}

export function MessageThread({
  chatId,
  currentUserId,
  chat = null,
  highlightedMessageId = null,
}: Props) {
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [previewImage, setPreviewImage] = useState<ImagePreview | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const {
    messages,
    loading,
    sending,
    editingMessageId,
    deletingMessageId,
    replyToMessage,
    error,
    send,
    sendAttachment,
    appendMessage,
    updateMessage,
    updateQuotedMessage,
    updateReceiptStatus,
    updateMessageReactions,
    reactToMessage,
    playGame,
    edit,
    deleteMessage,
    setReplyToMessage,
    clearReplyToMessage,
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
    onMessageEdited: (message) => {
      updateMessage(message);
      updateQuotedMessage(message);
    },
    onMessageDeleted: (message) => {
      updateMessage(message);
      updateQuotedMessage(message);
    },
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
  const replyToLabel = replyToMessage
    ? getUserLabel(
        chat?.members?.find((member) => member.userId === replyToMessage.senderId)
          ?.user,
        replyToMessage.senderId === currentUserId ? "You" : "Member",
      )
    : undefined;

  useEffect(() => {
    if (!highlightedMessageId) return;

    messageRefs.current[highlightedMessageId]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [highlightedMessageId, messages]);

  useEffect(() => {
    if (!copyNotice) {
      return;
    }

    const timeout = window.setTimeout(() => setCopyNotice(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyNotice]);

  const handleCopyMessage = useCallback(async (text: string) => {
    if (!text.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyNotice("Message copied");
    } catch {
      setCopyNotice("Could not copy message");
    }
  }, []);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#101114]">
      {previewImage ? (
        <ImagePreviewModal
          image={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      ) : null}

      {copyNotice ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-white/10 bg-[#20232b]/95 px-4 py-2 text-xs font-bold text-slate-100 shadow-2xl shadow-black/30 backdrop-blur">
          {copyNotice}
        </div>
      ) : null}

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
        onReply={setReplyToMessage}
        onCopy={handleCopyMessage}
        onPreviewImage={setPreviewImage}
        onGameAction={playGame}
        pendingReactionMessageIds={pendingReactionMessageIds}
        editingMessageId={editingMessageId}
        deletingMessageId={deletingMessageId}
        highlightedMessageId={highlightedMessageId}
        bottomRef={bottomRef}
        messageRefs={messageRefs}
      />

      {error && (
        <div className="mx-4 mb-3 flex items-center gap-3 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 shadow-lg shadow-black/20 sm:mx-5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500/15">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </span>
          {error}
        </div>
      )}

      <MessageComposer
        onSend={send}
        onAttach={sendAttachment}
        onKeyStroke={onKeyStroke}
        replyTo={replyToMessage}
        replyToLabel={replyToLabel}
        onCancelReply={clearReplyToMessage}
        disabled={sending}
      />
    </div>
  );
}
