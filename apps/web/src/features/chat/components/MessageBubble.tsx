// apps/web/src/features/chat/components/MessageBubble.tsx

import { useEffect, useRef, useState } from "react";
import type { UserDto } from "@chat/shared";
import { MessageDto, type MessageReactionEmoji } from "../api/messages.api";

const REACTION_EMOJIS: MessageReactionEmoji[] = ["👍", "❤️", "😂", "😮", "😢"];

interface Props {
  message: MessageDto;
  isOwn: boolean;
  highlighted?: boolean;
  groupedWithPrevious?: boolean;
  senderLabel?: string;
  senderUser?: UserDto;
  currentUserId: string;
  onReact?: (messageId: string, emoji: MessageReactionEmoji) => void;
  onEdit?: (messageId: string, text: string) => void;
  onDelete?: (messageId: string) => void;
  onReply?: (message: MessageDto) => void;
  replyToLabel?: string;
  reactionPending?: boolean;
  editing?: boolean;
  deleting?: boolean;
}

export function MessageBubble({
  message,
  isOwn,
  highlighted = false,
  groupedWithPrevious = false,
  senderLabel,
  senderUser,
  currentUserId,
  onReact,
  onEdit,
  onDelete,
  onReply,
  replyToLabel,
  reactionPending = false,
  editing = false,
  deleting = false,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.text ?? "");
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const ticks =
    message.receiptStatus === "seen"
      ? "✓✓"
      : message.receiptStatus === "delivered"
        ? "✓✓"
        : "✓";
  const tickColor =
    message.receiptStatus === "seen" ? "text-sky-300" : "text-white/45";
  const attachments = message.attachments ?? [];
  const avatarLabel = senderLabel?.slice(0, 1).toUpperCase() || "M";
  const reactions = message.reactions ?? [];
  const currentUserReaction = reactions.find((reaction) =>
    reaction.userIds.includes(currentUserId),
  )?.emoji;
  const canEdit =
    isOwn &&
    message.contentType === "text" &&
    !message.deletedAt &&
    Boolean(onEdit) &&
    !message.id.startsWith("demo-");
  const canDelete =
    isOwn &&
    !message.deletedAt &&
    Boolean(onDelete) &&
    !message.id.startsWith("demo-");
  const canReply =
    !message.deletedAt &&
    message.contentType !== "system" &&
    Boolean(onReply) &&
    !message.id.startsWith("demo-");
  const quotePreview = message.replyTo?.deletedAt
    ? "This message was deleted"
    : message.replyTo?.contentType === "attachment"
      ? (message.replyTo.text ?? "Attachment")
      : (message.replyTo?.text ?? "Message");

  useEffect(() => {
    if (!isEditing) {
      setEditValue(message.text ?? "");
    }
  }, [isEditing, message.text]);

  useEffect(() => {
    if (isEditing) {
      editRef.current?.focus();
      editRef.current?.select();
    }
  }, [isEditing]);

  const saveEdit = () => {
    const trimmedValue = editValue.trim();

    if (!trimmedValue || trimmedValue === (message.text ?? "").trim()) {
      setIsEditing(false);
      setEditValue(message.text ?? "");
      return;
    }

    onEdit?.(message.id, trimmedValue);
    setIsEditing(false);
  };

  const deleteCurrentMessage = () => {
    if (!window.confirm("Delete this message for everyone?")) {
      return;
    }

    onDelete?.(message.id);
  };

  if (message.contentType === "system") {
    return (
      <div
        className={`my-4 flex justify-center ${
          highlighted ? "rounded-2xl ring-2 ring-amber-300/80" : ""
        }`}
      >
        <div className="inline-flex max-w-[85%] items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-center text-[11px] font-semibold text-slate-300 shadow-lg shadow-black/15 md:max-w-[70%]">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 text-emerald-300"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          >
            <path d="m16 13 5 3V8l-5 3" />
            <rect x="3" y="6" width="13" height="12" rx="2" />
          </svg>
          <span className="min-w-0 break-words">{message.text}</span>
          <span className="shrink-0 text-slate-500">{time}</span>
        </div>
      </div>
    );
  }

  if (message.deletedAt) {
    return (
      <div
        className={[
          "group/message flex",
          groupedWithPrevious ? "mb-1" : "mb-3 mt-1",
          isOwn ? "justify-end" : "justify-start",
        ].join(" ")}
      >
        <div
          className={`flex max-w-[85%] gap-3 md:max-w-[70%] ${
            isOwn ? "flex-row-reverse" : ""
          }`}
        >
          {!isOwn ? (
            <div
              className={`${groupedWithPrevious ? "invisible" : ""} mt-1 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-sm font-bold text-white ring-1 ring-white/10`}
            >
              {senderUser?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={senderUser.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                avatarLabel
              )}
            </div>
          ) : null}

          <div className={`flex min-w-0 flex-col ${isOwn ? "items-end" : "items-start"}`}>
            {!isOwn && !groupedWithPrevious && senderLabel ? (
              <span className="mb-1.5 ml-1 text-xs font-bold text-cyan-400">
                {senderLabel}
              </span>
            ) : null}
            <div
              className={`rounded-[20px] border border-dashed px-4 py-2.5 text-sm italic leading-6 shadow-lg ${
                isOwn
                  ? "rounded-br-md border-emerald-200/30 bg-emerald-500/20 text-emerald-50/85"
                  : "rounded-bl-md border-white/10 bg-[#23262e]/70 text-slate-300"
              } ${highlighted ? "ring-2 ring-amber-300/80" : ""}`}
            >
              This message was deleted
            </div>
            {!groupedWithPrevious ? (
              <span className="mt-1.5 flex items-center gap-1 px-1 text-[11px] text-slate-500">
                {time}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "group/message flex",
        groupedWithPrevious ? "mb-1" : "mb-3 mt-1",
        isOwn ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      <div className={`flex max-w-[85%] gap-3 md:max-w-[70%] ${isOwn ? "flex-row-reverse" : ""}`}>
        {!isOwn ? (
          <div className={`${groupedWithPrevious ? "invisible" : ""} mt-1 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-sm font-bold text-white ring-1 ring-white/10`}>
            {senderUser?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={senderUser.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              avatarLabel
            )}
          </div>
        ) : null}

        <div className={`flex min-w-0 flex-col ${isOwn ? "items-end" : "items-start"}`}>
          {!isOwn && !groupedWithPrevious && senderLabel ? (
            <span className="mb-1.5 ml-1 text-xs font-bold text-cyan-400">
              {senderLabel}
            </span>
          ) : null}
          <div
            className={`break-words rounded-[20px] px-4 py-2.5 text-[15px] leading-6 shadow-lg ${
              isOwn
                ? "rounded-br-md bg-emerald-500 text-white shadow-emerald-950/20"
                : "rounded-bl-md border border-white/5 bg-[#23262e] text-white shadow-black/25"
            } ${highlighted ? "ring-2 ring-amber-300/80" : ""}`}
          >
            {message.replyTo ? (
              <div className="mb-2.5 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                <p className="truncate text-[11px] font-bold uppercase tracking-wide text-emerald-100/90">
                  {replyToLabel ?? "Message"}
                </p>
                <p className="mt-1 truncate text-xs leading-5 text-white/65">
                  {quotePreview}
                </p>
              </div>
            ) : null}
            {attachments.length > 0 && (
              <div className="mb-2.5 space-y-2">
                {attachments.map((attachment) => {
                  if (attachment.resourceType === "image") {
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={attachment.id}
                        src={attachment.url}
                        alt=""
                        className="max-h-80 rounded-2xl object-cover"
                      />
                    );
                  }

                  if (attachment.resourceType === "video") {
                    return (
                      <video
                        key={attachment.id}
                        src={attachment.url}
                        controls
                        className="max-h-80 rounded-2xl"
                      />
                    );
                  }

                  return (
                    <a
                      key={attachment.id}
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl border border-white/15 bg-black/15 px-3 py-2 text-xs font-medium underline-offset-2 hover:underline"
                    >
                      Download attachment
                    </a>
                  );
                })}
              </div>
            )}
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  ref={editRef}
                  value={editValue}
                  rows={2}
                  onChange={(event) => setEditValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      saveEdit();
                    }

                    if (event.key === "Escape") {
                      setIsEditing(false);
                      setEditValue(message.text ?? "");
                    }
                  }}
                  className="min-h-20 w-full resize-none rounded-2xl border border-white/15 bg-black/15 px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/45 focus:border-white/35"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditValue(message.text ?? "");
                    }}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/80 transition hover:bg-white/15"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={editing}
                    className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              message.text
            )}
          </div>
          {!groupedWithPrevious ? (
            <span className="mt-1.5 flex items-center gap-1 px-1 text-[11px] text-slate-500">
              {time}
              {message.editedAt ? <span>edited</span> : null}
              {isOwn ? <span className={tickColor}>{ticks}</span> : null}
            </span>
          ) : null}

          {reactions.length > 0 ? (
            <div
              className={`mt-1.5 flex flex-wrap gap-1.5 ${
                isOwn ? "justify-end" : "justify-start"
              }`}
            >
              {reactions.map((reaction) => {
                const reactedByCurrentUser =
                  currentUserReaction === reaction.emoji;

                return (
                  <button
                  key={reaction.emoji}
                  type="button"
                  disabled={reactionPending}
                  onClick={() => onReact?.(message.id, reaction.emoji)}
                  className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs leading-none shadow-sm transition ${
                    reactedByCurrentUser
                      ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-100"
                      : "border-white/10 bg-[#20232b] text-slate-200 hover:border-white/20 hover:bg-[#2a2d36]"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                    title={
                      reactedByCurrentUser
                        ? "Click to remove your reaction"
                        : "React"
                    }
                  >
                    <span>{reaction.emoji}</span>
                    <span className="text-[11px] font-semibold text-slate-300">
                      {reaction.count}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {onReact ? (
            <div
              className={`relative mt-1.5 flex gap-1.5 opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100 ${
                isOwn ? "self-end" : "self-start"
              }`}
            >
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  disabled={editing}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-[#20232b] text-slate-400 shadow-sm transition hover:border-white/20 hover:bg-[#2a2d36] hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Edit message"
                  aria-label="Edit message"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              ) : null}

              {canDelete ? (
                <button
                  type="button"
                  onClick={deleteCurrentMessage}
                  disabled={deleting}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-[#20232b] text-slate-400 shadow-sm transition hover:border-red-300/30 hover:bg-red-500/15 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Delete message"
                  aria-label="Delete message"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v5" />
                    <path d="M14 11v5" />
                  </svg>
                </button>
              ) : null}

              {canReply ? (
                <button
                  type="button"
                  onClick={() => onReply?.(message)}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-[#20232b] text-slate-400 shadow-sm transition hover:border-white/20 hover:bg-[#2a2d36] hover:text-slate-100"
                  title="Reply"
                  aria-label="Reply"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  >
                    <path d="m9 14-4-4 4-4" />
                    <path d="M5 10h9a5 5 0 0 1 5 5v3" />
                  </svg>
                </button>
              ) : null}

              <button
                type="button"
                className="peer flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-[#20232b] text-slate-400 shadow-sm transition hover:border-white/20 hover:bg-[#2a2d36] hover:text-slate-100"
                title="Add reaction"
                aria-label="Add reaction"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <path d="M9 9h.01" />
                  <path d="M15 9h.01" />
                  <path d="M19 5v4" />
                  <path d="M21 7h-4" />
                </svg>
              </button>

              <div
                className={`absolute bottom-8 z-20 hidden gap-1 rounded-full border border-white/10 bg-[#20232b] p-1 shadow-xl shadow-black/30 peer-hover:flex hover:flex peer-focus:flex focus-within:flex ${
                  isOwn ? "right-0" : "left-0"
                }`}
              >
                {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  disabled={reactionPending}
                  onClick={() => onReact(message.id, emoji)}
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 ${
                    currentUserReaction === emoji ? "bg-emerald-500/25" : ""
                  }`}
                  title={
                    currentUserReaction === emoji
                      ? "Remove reaction"
                      : `React ${emoji}`
                  }
                >
                  {emoji}
                </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
