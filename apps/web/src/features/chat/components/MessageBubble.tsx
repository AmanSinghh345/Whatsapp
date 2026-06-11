// apps/web/src/features/chat/components/MessageBubble.tsx

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
  reactionPending?: boolean;
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
  reactionPending = false,
}: Props) {
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

  if (message.contentType === "system") {
    return (
      <div
        className={`my-4 flex justify-center ${
          highlighted ? "rounded-2xl ring-2 ring-amber-300/80" : ""
        }`}
      >
        <div className="inline-flex max-w-[min(88%,520px)] items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-center text-xs font-semibold text-slate-300 shadow-lg shadow-black/15">
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

  return (
    <div
      className={[
        "group/message flex",
        groupedWithPrevious ? "mb-1" : "mb-5 mt-1",
        isOwn ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      <div className={`flex max-w-[min(86%,760px)] gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
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
            className={`break-words rounded-[22px] px-5 py-4 text-[15px] leading-7 shadow-lg ${
              isOwn
                ? "rounded-br-md bg-emerald-500 text-white shadow-emerald-950/20"
                : "rounded-bl-md border border-white/5 bg-[#23262e] text-white shadow-black/25"
            } ${highlighted ? "ring-2 ring-amber-300/80" : ""}`}
          >
            {attachments.length > 0 && (
              <div className="mb-3 space-y-2">
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
            {message.text}
          </div>
          {!groupedWithPrevious ? (
            <span className="mt-2 flex items-center gap-1 px-1 text-[11px] text-slate-400">
              {time}
              {isOwn ? <span className={tickColor}>{ticks}</span> : null}
            </span>
          ) : null}

          {reactions.length > 0 ? (
            <div
              className={`mt-2 flex flex-wrap gap-1.5 ${
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
                  className={`inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs leading-none shadow-sm transition ${
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
              className={`relative mt-1.5 opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100 ${
                isOwn ? "self-end" : "self-start"
              }`}
            >
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
