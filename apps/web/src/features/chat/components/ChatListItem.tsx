import type { ChatDto } from "@chat/shared";
import {
  formatChatTime,
  getChatAvatarUser,
  getChatSubtitle,
  getChatTitle,
  type DisplayChat,
} from "./chat-display";
import { ChatAvatar } from "./ChatAvatar";
import { OnlineStatusDot } from "./OnlineStatusDot";

interface ChatListItemProps {
  chat: DisplayChat;
  currentUserId?: string | undefined;
  active: boolean;
  online: boolean;
  isTyping: boolean;
  presenceText: string;
  onSelect: (chatId: ChatDto["id"]) => void;
}

export function ChatListItem({
  chat,
  currentUserId,
  active,
  online,
  isTyping,
  presenceText,
  onSelect,
}: ChatListItemProps) {
  const title = getChatTitle(chat, currentUserId);
  const subtitle = getChatSubtitle(chat, currentUserId);
  const avatarUser = getChatAvatarUser(chat, currentUserId);
  const unreadCount = chat.unreadCount ?? 0;
  const preview = isTyping ? "Typing..." : (chat.lastMessagePreview ?? subtitle);
  const time = formatChatTime(chat.lastMessageAt ?? chat.updatedAt);

  return (
    <button
      type="button"
      onClick={() => onSelect(chat.id)}
      className={[
        "group w-full rounded-xl border px-3 py-3 text-left transition",
        active
          ? "border-cyan-300/20 bg-cyan-300/[0.1] shadow-lg shadow-cyan-950/20"
          : "border-transparent hover:border-white/10 hover:bg-white/[0.055]",
      ].join(" ")}
    >
      <div className="flex gap-3">
        <div className="relative">
          <ChatAvatar label={title} user={avatarUser} imageUrl={chat.avatarUrl} />
          <OnlineStatusDot
            online={online}
            className="absolute -bottom-0.5 -right-0.5"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-100">
              {title}
            </span>
            <span className="ml-auto shrink-0 text-[11px] text-slate-500">
              {time}
            </span>
          </div>

          <div className="mt-1 flex min-w-0 items-center gap-2">
            <span
              className={[
                "truncate text-xs",
                isTyping ? "font-semibold text-emerald-300" : "text-slate-400",
              ].join(" ")}
            >
              {preview}
            </span>
            {unreadCount > 0 ? (
              <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-cyan-400 px-1.5 text-[11px] font-bold text-slate-950">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </div>

          <p className="mt-1 truncate text-[11px] text-slate-500">{presenceText}</p>
        </div>
      </div>
    </button>
  );
}
