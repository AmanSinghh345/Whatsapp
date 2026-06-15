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
  isCreatingGroup: boolean;
  isAddingGroupMember: boolean;
  phoneSearch: string;
  groupTitle: string;
  groupPhoneSearch: string;
  groupMembers: UserDto[];
  sidebarOpen: boolean;
  infoPanelOpen: boolean;
  getPresence: (userId: string) => PresenceView | undefined;
  isOnline: (userId: string) => boolean;
  onSearchChange: (value: string) => void;
  onPhoneSearchChange: (value: string) => void;
  onGroupTitleChange: (value: string) => void;
  onGroupPhoneSearchChange: (value: string) => void;
  onCreateDirectChat: (event: React.FormEvent<HTMLFormElement>) => void;
  onAddGroupMember: (event: React.FormEvent<HTMLFormElement>) => void;
  onRemoveGroupMember: (userId: string) => void;
  onCreateGroupChat: (event: React.FormEvent<HTMLFormElement>) => void;
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
  isCreatingGroup,
  isAddingGroupMember,
  phoneSearch,
  groupTitle,
  groupPhoneSearch,
  groupMembers,
  sidebarOpen,
  infoPanelOpen,
  getPresence,
  isOnline,
  onSearchChange,
  onPhoneSearchChange,
  onGroupTitleChange,
  onGroupPhoneSearchChange,
  onCreateDirectChat,
  onAddGroupMember,
  onRemoveGroupMember,
  onCreateGroupChat,
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
        isCreatingGroup={isCreatingGroup}
        isAddingGroupMember={isAddingGroupMember}
        phoneSearch={phoneSearch}
        groupTitle={groupTitle}
        groupPhoneSearch={groupPhoneSearch}
        groupMembers={groupMembers}
        isOpen={sidebarOpen}
        getPresence={getPresence}
        isOnline={isOnline}
        onSearchChange={onSearchChange}
        onPhoneSearchChange={onPhoneSearchChange}
        onGroupTitleChange={onGroupTitleChange}
        onGroupPhoneSearchChange={onGroupPhoneSearchChange}
        onCreateDirectChat={onCreateDirectChat}
        onAddGroupMember={onAddGroupMember}
        onRemoveGroupMember={onRemoveGroupMember}
        onCreateGroupChat={onCreateGroupChat}
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
