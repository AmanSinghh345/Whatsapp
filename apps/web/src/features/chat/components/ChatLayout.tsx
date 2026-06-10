"use client";

import type { ChatDto, UserDto } from "@chat/shared";
import { WorkspaceRail } from "./WorkspaceRail";
import { ChatSidebar } from "./ChatSidebar";
import { ChatWindow } from "./ChatWindow";
import type { DisplayChat, PresenceView } from "./chat-display";

interface ChatLayoutProps {
  user: UserDto | null;
  chats: DisplayChat[];
  selectedChat: ChatDto | null;
  selectedChatId: string | null;
  searchQuery: string;
  loading: boolean;
  error: string | null;
  isCreating: boolean;
  phoneSearch: string;
  sidebarOpen: boolean;
  infoPanelOpen: boolean;
  getPresence: (userId: string) => PresenceView | undefined;
  isOnline: (userId: string) => boolean;
  onSearchChange: (value: string) => void;
  onPhoneSearchChange: (value: string) => void;
  onCreateDirectChat: (event: React.FormEvent<HTMLFormElement>) => void;
  onSelectChat: (chatId: ChatDto["id"]) => void;
  onRefresh: () => void;
  onOpenSidebar: () => void;
  onCloseSidebar: () => void;
  onToggleInfo: () => void;
}

export function ChatLayout({
  user,
  chats,
  selectedChat,
  selectedChatId,
  searchQuery,
  loading,
  error,
  isCreating,
  phoneSearch,
  sidebarOpen,
  infoPanelOpen,
  getPresence,
  isOnline,
  onSearchChange,
  onPhoneSearchChange,
  onCreateDirectChat,
  onSelectChat,
  onRefresh,
  onOpenSidebar,
  onCloseSidebar,
  onToggleInfo,
}: ChatLayoutProps) {
  return (
    <main className="flex h-screen overflow-hidden bg-[#080c13] text-slate-100">
      <WorkspaceRail user={user} active="chats" />
      <ChatSidebar
        user={user}
        chats={chats}
        selectedChatId={selectedChatId}
        searchQuery={searchQuery}
        loading={loading}
        error={error}
        isCreating={isCreating}
        phoneSearch={phoneSearch}
        isOpen={sidebarOpen}
        getPresence={getPresence}
        isOnline={isOnline}
        onSearchChange={onSearchChange}
        onPhoneSearchChange={onPhoneSearchChange}
        onCreateDirectChat={onCreateDirectChat}
        onSelectChat={onSelectChat}
        onRefresh={onRefresh}
        onCloseMobile={onCloseSidebar}
      />
      <ChatWindow
        chat={selectedChat}
        currentUserId={user?.id}
        infoPanelOpen={infoPanelOpen}
        getPresence={getPresence}
        isOnline={isOnline}
        onToggleSidebar={onOpenSidebar}
        onToggleInfo={onToggleInfo}
      />
    </main>
  );
}
