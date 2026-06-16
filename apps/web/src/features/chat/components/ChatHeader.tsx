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
  callAvailable?: boolean;
  callActive?: boolean;
  onToggleSidebar: () => void;
  onToggleInfo: () => void;
  onStartVideoCall?: () => void;
}

export function ChatHeader({
  chat,
  currentUserId,
  online,
  presenceText,
  callAvailable = false,
  callActive = false,
  onToggleSidebar,
  onToggleInfo,
  onStartVideoCall,
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
        aria-label="Start video call"
        title={
          callAvailable
            ? "Start video call"
            : "Video calls are available in direct chats"
        }
        onClick={onStartVideoCall}
        disabled={!callAvailable || callActive}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-200 transition hover:bg-white/[0.08] hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        >
          <path d="m16 13 5 3V8l-5 3" />
          <rect x="3" y="6" width="13" height="12" rx="2" />
        </svg>
      </button>

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
