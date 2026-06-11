"use client";

import type { ChatDto } from "@chat/shared";
import type { MessageDto, MessageReactionEmoji } from "../api/messages.api";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { getUserLabel } from "./chat-display";

interface MessageListProps {
  chat?: ChatDto | null;
  messages: MessageDto[];
  currentUserId: string;
  loading?: boolean;
  typing?: boolean;
  typingLabel?: string;
  onReact?: (messageId: string, emoji: MessageReactionEmoji) => void;
  pendingReactionMessageIds?: Set<string>;
  highlightedMessageId?: string | null;
  bottomRef?: React.RefObject<HTMLDivElement | null>;
  messageRefs?: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}

function isSameMessageGroup(current: MessageDto, previous?: MessageDto) {
  if (!previous) return false;
  if (current.contentType === "system" || previous.contentType === "system") {
    return false;
  }
  if (current.senderId !== previous.senderId) return false;

  const currentTime = new Date(current.createdAt).getTime();
  const previousTime = new Date(previous.createdAt).getTime();
  if (Number.isNaN(currentTime) || Number.isNaN(previousTime)) return false;

  return currentTime - previousTime < 5 * 60 * 1000;
}

function getSenderLabel(chat: ChatDto | null | undefined, senderId: string) {
  return getUserLabel(
    chat?.members?.find((member) => member.userId === senderId)?.user,
    "Member",
  );
}

function getSenderUser(chat: ChatDto | null | undefined, senderId: string) {
  return chat?.members?.find((member) => member.userId === senderId)?.user;
}

export function MessageList({
  chat,
  messages,
  currentUserId,
  loading = false,
  typing = false,
  typingLabel = "Someone is typing...",
  onReact,
  pendingReactionMessageIds,
  highlightedMessageId = null,
  bottomRef,
  messageRefs,
}: MessageListProps) {
  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto bg-[#101114]">
      <div className="relative z-10 flex flex-1 flex-col px-4 py-6 sm:px-7 lg:px-9">
        {loading ? (
          <div className="mx-auto mt-10 rounded-full border border-white/10 bg-[#20232b] px-4 py-2 text-sm text-slate-400">
            Loading messages...
          </div>
        ) : null}

        {!loading && messages.length === 0 ? (
          <div className="mt-auto flex justify-center pb-10 pt-10">
            <div className="rounded-2xl border border-white/10 bg-[#20232b] px-5 py-4 text-center shadow-xl shadow-black/20">
              <p className="text-sm font-semibold text-slate-100">
                This channel is quiet.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Send the first message and give it a pulse.
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-auto">
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const groupedWithPrevious = isSameMessageGroup(message, previous);
            const senderUser = getSenderUser(chat, message.senderId);

            return (
              <div
                key={message.id}
                ref={(node) => {
                  if (messageRefs) {
                    messageRefs.current[message.id] = node;
                  }
                }}
              >
                <MessageBubble
                  message={message}
                  isOwn={message.senderId === currentUserId}
                  highlighted={message.id === highlightedMessageId}
                  groupedWithPrevious={groupedWithPrevious}
                  senderLabel={getSenderLabel(chat, message.senderId)}
                  currentUserId={currentUserId}
                  reactionPending={pendingReactionMessageIds?.has(message.id) ?? false}
                  {...(onReact ? { onReact } : {})}
                  {...(senderUser ? { senderUser } : {})}
                />
              </div>
            );
          })}

          {typing ? <TypingIndicator label={typingLabel} /> : null}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
