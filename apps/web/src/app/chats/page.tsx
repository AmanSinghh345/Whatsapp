"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatDto } from "@chat/shared";
import { ProtectedRoute } from "../../features/auth/components/protected-route";
import { useAuthStore } from "../../features/auth/store/auth.store";
import { createDirectChat, fetchChats } from "../../features/chat/api/chats.api";
import { ChatLayout } from "../../features/chat/components/ChatLayout";
import {
  getOtherMemberIds,
  type DisplayChat,
} from "../../features/chat/components/chat-display";
import { useLiveChatPreviews } from "../../features/chat/hooks/useLiveChatPreviews";
import { usePresence } from "../../features/realtime/usePresence";
import { useBrowserNotifications } from "../../features/realtime/useBrowserNotifications";
import { getSocket } from "../../features/realtime/socket.client";
import { useGlobalTypingListener } from "../../features/realtime/useTypingIndicator";
import { searchUserByPhone } from "../../features/user/api/users.api";

function buildDemoChats(currentUserId?: string): DisplayChat[] {
  const now = new Date();

  return [
    {
      id: "demo-chat-product",
      type: "group",
      title: "Product Pulse",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastMessageAt: now.toISOString(),
      lastMessagePreview: "Mira: Shipping notes are in the canvas.",
      unreadCount: 3,
      members: [
        {
          chatId: "demo-chat-product",
          userId: currentUserId ?? "demo-me",
          role: "admin",
          joinedAt: now.toISOString(),
        },
        {
          chatId: "demo-chat-product",
          userId: "demo-mira",
          role: "member",
          joinedAt: now.toISOString(),
          user: {
            id: "demo-mira",
            firebaseUid: "demo-mira",
            displayName: "Mira Chen",
            email: "mira@example.com",
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        },
      ],
    },
    {
      id: "demo-chat-ravi",
      type: "direct",
      createdAt: now.toISOString(),
      updatedAt: new Date(now.getTime() - 18 * 60 * 1000).toISOString(),
      lastMessageAt: new Date(now.getTime() - 18 * 60 * 1000).toISOString(),
      lastMessagePreview: "Can you check the socket receipt state?",
      unreadCount: 0,
      members: [
        {
          chatId: "demo-chat-ravi",
          userId: currentUserId ?? "demo-me",
          role: "member",
          joinedAt: now.toISOString(),
        },
        {
          chatId: "demo-chat-ravi",
          userId: "demo-ravi",
          role: "member",
          joinedAt: now.toISOString(),
          user: {
            id: "demo-ravi",
            firebaseUid: "demo-ravi",
            displayName: "Ravi Singh",
            phoneE164: "+919876543210",
            lastSeenAt: new Date(now.getTime() - 11 * 60 * 1000).toISOString(),
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        },
      ],
    },
  ];
}

export default function ChatsPage() {
  const user = useAuthStore((state) => state.user);
  const joinedChatIdsRef = useRef<Set<string>>(new Set());
  const [chats, setChats] = useState<DisplayChat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [phoneSearch, setPhoneSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const otherUserIds = useMemo(() => {
    if (!user) return [];

    return Array.from(
      new Set(chats.flatMap((chat) => getOtherMemberIds(chat, user.id))),
    );
  }, [chats, user]);

  const { getPresence, isOnline } = usePresence(otherUserIds);

  useGlobalTypingListener();
  useBrowserNotifications({
    chats,
    currentUserId: user?.id,
    selectedChatId,
    onSelectChat: (chatId) => {
      setSelectedChatId(chatId);
      setSidebarOpen(false);
    },
  });
  useLiveChatPreviews({
    currentUserId: user?.id,
    selectedChatId,
    setChats,
  });

  async function loadChats() {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchChats();
      setChats(result.data);
      setSelectedChatId((current) => {
        if (current && result.data.some((chat) => chat.id === current)) {
          return current;
        }

        return result.data[0]?.id ?? null;
      });
    } catch (error) {
      const demoChats = buildDemoChats(user.id);
      setChats(demoChats);
      setSelectedChatId((current) => current ?? demoChats[0]?.id ?? null);
      setError(
        error instanceof Error
          ? `${error.message}. Showing demo conversations.`
          : "Could not load chats. Showing demo conversations.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateDirectChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedPhone = phoneSearch.trim();
    if (!trimmedPhone) {
      setError("Enter a phone number to start a direct chat.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const foundUser = await searchUserByPhone(trimmedPhone);
      if (foundUser.id === user?.id) {
        throw new Error("You cannot create a direct chat with yourself.");
      }

      const chat = await createDirectChat({ otherUserId: foundUser.id });
      setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
      setSelectedChatId(chat.id);
      setPhoneSearch("");
      setSidebarOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to create chat.");
    } finally {
      setIsCreating(false);
    }
  }

  useEffect(() => {
    if (user) {
      void loadChats();
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || chats.length === 0) {
      return;
    }

    let active = true;
    let cleanupReconnectHandler: (() => void) | undefined;
    const chatIds = chats
      .map((chat) => chat.id)
      .filter((chatId) => !chatId.startsWith("demo-chat-"));

    void getSocket().then((socket) => {
      if (!active) return;

      const joinAllChats = () => {
        for (const chatId of chatIds) {
          socket.emit("chat:join", { chatId });
          joinedChatIdsRef.current.add(chatId);
        }
      };

      joinAllChats();
      socket.on("connect", joinAllChats);
      cleanupReconnectHandler = () => socket.off("connect", joinAllChats);
    });

    return () => {
      active = false;
      cleanupReconnectHandler?.();
    };
  }, [chats, user?.id]);

  return (
    <ProtectedRoute>
      <ChatLayout
        user={user}
        chats={chats}
        selectedChat={selectedChat}
        selectedChatId={selectedChatId}
        searchQuery={searchQuery}
        loading={loading}
        error={error}
        isCreating={isCreating}
        phoneSearch={phoneSearch}
        sidebarOpen={sidebarOpen}
        infoPanelOpen={infoPanelOpen}
        getPresence={getPresence}
        isOnline={isOnline}
        onSearchChange={setSearchQuery}
        onPhoneSearchChange={setPhoneSearch}
        onCreateDirectChat={handleCreateDirectChat}
        onSelectChat={(chatId: ChatDto["id"]) => setSelectedChatId(chatId)}
        onRefresh={() => void loadChats()}
        onOpenSidebar={() => setSidebarOpen(true)}
        onCloseSidebar={() => setSidebarOpen(false)}
        onToggleInfo={() => setInfoPanelOpen((current) => !current)}
      />
    </ProtectedRoute>
  );
}
