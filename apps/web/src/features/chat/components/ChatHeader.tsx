"use client";

import type { ChatDto } from "@chat/shared";
import { ChatAvatar } from "./ChatAvatar";
import { OnlineStatusDot } from "./OnlineStatusDot";
import {
  getChatAvatarUser,
  getChatSubtitle,
  getChatTitle,
} from "./chat-display";

interface ChatHeaderProps {
  chat: ChatDto;
  currentUserId?: string;
  online: boolean;
  presenceText: string;
  onToggleSidebar: () => void;
  onToggleInfo: () => void;
}

export function ChatHeader({
  chat,
  currentUserId,
  online,
  presenceText,
  onToggleSidebar,
  onToggleInfo,
}: ChatHeaderProps) {
  const title = getChatTitle(chat, currentUserId);
  const subtitle = getChatSubtitle(chat, currentUserId);
  const avatarUser = getChatAvatarUser(chat, currentUserId);

  return (
    <header className="flex h-[72px] shrink-0 items-center gap-3 border-b border-white/10 bg-[#101722]/90 px-3 shadow-lg shadow-black/20 backdrop-blur-xl sm:px-5">
      <button
        type="button"
        aria-label="Open conversations"
        onClick={onToggleSidebar}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-xl text-slate-300 transition hover:bg-white/[0.07] md:hidden"
      >
        =
      </button>

      <div className="relative">
        <ChatAvatar label={title} user={avatarUser} imageUrl={chat.avatarUrl} />
        <OnlineStatusDot
          online={online}
          size="md"
          className="absolute -bottom-0.5 -right-0.5"
        />
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-bold text-slate-50">{title}</h1>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {presenceText} • {subtitle}
        </p>
      </div>

      <button
        type="button"
        aria-label="Toggle chat info"
        title="Chat info"
        onClick={onToggleInfo}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-slate-300 transition hover:bg-white/[0.07] hover:text-cyan-100"
      >
        i
      </button>
    </header>
  );
}
