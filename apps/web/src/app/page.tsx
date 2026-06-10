"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatDto, ChatMemberDto, UserDto } from "@chat/shared";
import { ProtectedRoute } from "../features/auth/components/protected-route";
import { useAuthStore } from "../features/auth/store/auth.store";
import { createDirectChat, fetchChats } from "../features/chat/api/chats.api";
import {
  searchMessages,
  type MessageDto,
} from "../features/chat/api/messages.api";
import { MessageThread } from "../features/chat/components/MessageThread";
import { usePresence } from "../features/realtime/usePresence";
import { getSocket } from "../features/realtime/socket.client";
import { useGlobalTypingListener } from "../features/realtime/useTypingIndicator";
import { useTypingStore } from "../features/realtime/typing.store";
import { PresenceDot } from "../features/chat/components/PresenceDot";
import { searchUserByPhone } from "../features/user/api/users.api";

function getOtherMembers(chat: ChatDto, currentUserId?: string): ChatMemberDto[] {
  return (chat.members ?? []).filter((member) => member.userId !== currentUserId);
}

function getOtherMemberIds(chat: ChatDto, currentUserId?: string) {
  return getOtherMembers(chat, currentUserId).map((member) => member.userId);
}

function getChatTitle(chat: ChatDto, currentUserId?: string) {
  if (chat.type === "group") {
    return chat.title ?? "Group chat";
  }

  return getOtherMembers(chat, currentUserId)[0]?.user?.displayName ?? "Direct chat";
}

function getChatSubtitle(chat: ChatDto, currentUserId?: string) {
  if (chat.type === "group") {
    return `${chat.members?.length ?? 0} members`;
  }

  const otherUser = getOtherMembers(chat, currentUserId)[0]?.user;
  return otherUser?.phoneE164 ?? otherUser?.email ?? "Direct message";
}

type PresenceView = {
  state: "online" | "offline";
  lastSeenAt?: string;
};

function formatPresenceStatus(presence?: PresenceView, fallbackLastSeenAt?: string) {
  if (presence?.state === "online") {
    return "Online";
  }

  const lastSeenAt = presence?.lastSeenAt ?? fallbackLastSeenAt;

  if (!lastSeenAt) {
    return "Offline";
  }

  const lastSeenTime = new Date(lastSeenAt).getTime();

  if (Number.isNaN(lastSeenTime)) {
    return "Offline";
  }

  const minutesAgo = Math.max(
    1,
    Math.floor((Date.now() - lastSeenTime) / 60_000),
  );

  return `Last seen ${minutesAgo} min ago`;
}

function getChatPresenceStatus(
  members: ChatMemberDto[],
  getPresence: (userId: string) => PresenceView | undefined,
) {
  const onlineMember = members.find(
    (member) => getPresence(member.userId)?.state === "online",
  );

  if (onlineMember) {
    return "Online";
  }

  const memberWithLatestSeen = members
    .map((member) => ({
      presence: getPresence(member.userId),
      lastSeenAt:
        getPresence(member.userId)?.lastSeenAt ?? member.user?.lastSeenAt,
    }))
    .filter((item) => item.lastSeenAt)
    .sort(
      (a, b) =>
        new Date(b.lastSeenAt!).getTime() - new Date(a.lastSeenAt!).getTime(),
    )[0];

  return formatPresenceStatus(
    memberWithLatestSeen?.presence,
    memberWithLatestSeen?.lastSeenAt,
  );
}

function Avatar({
  user,
  label,
  size = "md",
}: {
  user?: UserDto | undefined;
  label: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "lg" ? "h-14 w-14 text-lg" : size === "sm" ? "h-11 w-11" : "h-12 w-12";

  return (
    <div
      className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-emerald-500 to-slate-700 text-sm font-semibold text-white ring-1 ring-white/10`}
    >
      {user?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        label.slice(0, 1).toUpperCase() || "U"
      )}
    </div>
  );
}

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const joinedChatIdsRef = useRef<Set<string>>(new Set());

  const [chats, setChats] = useState<ChatDto[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [messageSearchResults, setMessageSearchResults] = useState<MessageDto[]>([]);
  const [messageSearchLoading, setMessageSearchLoading] = useState(false);
  const [messageSearchError, setMessageSearchError] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(
    null,
  );
  const typingByChatId = useTypingStore((state) => state.typingByChatId);
  const clearTypingChat = useTypingStore((state) => state.clearChat);

  useGlobalTypingListener();

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const otherUserIds = useMemo(() => {
    if (!user) return [];

    const ids = chats.flatMap((chat) => getOtherMemberIds(chat, user.id));
    return Array.from(new Set(ids));
  }, [chats, user?.id]);

  const { getPresence, isOnline } = usePresence(otherUserIds);

  async function loadChats() {
    setIsLoading(true);
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
      setError(error instanceof Error ? error.message : "Failed to load chats.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateDirectChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedPhone = phoneSearch.trim();

    if (!trimmedPhone) {
      setError("Enter a phone number to start a chat.");
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

      setChats((current) => {
        const withoutDuplicate = current.filter((item) => item.id !== chat.id);
        return [chat, ...withoutDuplicate];
      });

      setSelectedChatId(chat.id);
      setPhoneSearch("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to create chat.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleMessageSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedChatId) {
      return;
    }

    const trimmedQuery = messageSearchQuery.trim();

    if (trimmedQuery.length < 2) {
      setMessageSearchError("Enter at least 2 characters.");
      setMessageSearchResults([]);
      return;
    }

    setMessageSearchLoading(true);
    setMessageSearchError(null);
    setHighlightedMessageId(null);

    try {
      const result = await searchMessages(selectedChatId, trimmedQuery);
      setMessageSearchResults(result.messages);
    } catch (error) {
      setMessageSearchError(
        error instanceof Error ? error.message : "Failed to search messages.",
      );
      setMessageSearchResults([]);
    } finally {
      setMessageSearchLoading(false);
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
    const chatIds = chats.map((chat) => chat.id);

    void getSocket().then((socket) => {
      if (!active) return;

      const joinAllChats = () => {
        for (const chatId of chatIds) {
          console.log("[typing] joining chat room for typing:", chatId);
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

  useEffect(() => {
    return () => {
      const joinedChatIds = Array.from(joinedChatIdsRef.current);

      if (joinedChatIds.length === 0) {
        return;
      }

      void getSocket().then((socket) => {
        joinedChatIds.forEach((chatId) => {
          socket.emit("chat:leave", { chatId });
          clearTypingChat(chatId);
        });
        joinedChatIdsRef.current.clear();
      });
    };
  }, [clearTypingChat]);

  useEffect(() => {
    setMessageSearchQuery("");
    setMessageSearchResults([]);
    setMessageSearchError(null);
    setHighlightedMessageId(null);
  }, [selectedChatId]);

  return (
    <ProtectedRoute>
      <main className="h-screen overflow-hidden bg-[#0f1013] p-0 text-zinc-50 md:p-6">
        <div className="mx-auto flex h-full max-w-[1440px] flex-col overflow-hidden border border-white/10 bg-[#111216] shadow-2xl shadow-black/40 md:rounded-3xl lg:flex-row">
        <aside className="flex min-h-0 w-full shrink-0 flex-col border-b border-white/10 bg-[#17191f] lg:w-[380px] lg:border-b-0 lg:border-r">
          <div className="space-y-5 p-5">
            <div className="flex items-center justify-between gap-3">
              <Link href="/profile" className="flex min-w-0 items-center gap-3">
                <div className="relative">
                  <Avatar user={user ?? undefined} label={user?.displayName ?? "User"} size="lg" />
                  <span className="absolute bottom-0 right-0 rounded-full bg-[#17191f] p-1">
                    <PresenceDot online size="md" />
                  </span>
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-bold text-white">
                    {user?.displayName ?? "Your profile"}
                  </h2>
                  <p className="mt-0.5 truncate text-sm text-slate-400">
                    {user?.phoneE164 ?? user?.email ?? "Add your details"}
                  </p>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => void loadChats()}
                disabled={isLoading}
                aria-label="Refresh chats"
                title="Refresh chats"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 0 1-15.4 6.4" />
                  <path d="M3 12A9 9 0 0 1 18.4 5.6" />
                  <path d="M18 2v4h4" />
                  <path d="M6 22v-4H2" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateDirectChat} className="space-y-3">
              <label htmlFor="other-user-id" className="sr-only">
                Start direct chat by phone
              </label>
              <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-[#20232b] px-4 py-3 text-slate-400 shadow-inner shadow-black/20 focus-within:border-emerald-400/50">
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  id="other-user-id"
                  value={phoneSearch}
                  onChange={(event) => setPhoneSearch(event.target.value)}
                  placeholder="Search conversations..."
                  className="min-w-0 flex-1 bg-transparent text-base text-slate-100 outline-none placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  disabled={isCreating}
                  className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-[#07110d] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCreating ? "..." : "New"}
                </button>
              </div>
            </form>

            <div className="flex items-center gap-3 text-sm font-semibold text-slate-400">
              <button type="button" className="flex items-center gap-2 rounded-2xl bg-emerald-500/15 px-4 py-3 text-emerald-400">
                <span className="h-4 w-4 rounded border border-emerald-400" />
                All
              </button>
              <button type="button" className="flex items-center gap-2 rounded-2xl px-4 py-3 transition hover:bg-white/[0.04] hover:text-slate-100">
                <span className="text-lg leading-none">::</span>
                Groups
              </button>
              <button type="button" className="flex items-center gap-2 rounded-2xl px-4 py-3 transition hover:bg-white/[0.04] hover:text-slate-100">
                <span className="h-4 w-4 rounded-full border border-current" />
                Direct
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#17191f]">
            {isLoading ? (
              <p className="px-5 py-4 text-sm text-slate-400">Loading chats...</p>
            ) : chats.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">No chats yet</p>
            ) : (
              <div className="space-y-1 pb-3">
                {chats.map((chat) => {
                  const isSelected = chat.id === selectedChatId;
                  const otherMembers = getOtherMembers(chat, user?.id);
                  const otherUser = otherMembers[0]?.user;
                  const title = getChatTitle(chat, user?.id);
                  const subtitle = getChatSubtitle(chat, user?.id);
                  const otherMemberIds = otherMembers.map((member) => member.userId);
                  const hasOnlineMember = otherMemberIds.some((id) =>
                    isOnline(id),
                  );
                  const presenceStatus = getChatPresenceStatus(
                    otherMembers,
                    getPresence,
                  );
                  const typingUserIds = (typingByChatId[chat.id] ?? []).filter(
                    (id) => id !== user?.id,
                  );
                  const isTypingInChat = typingUserIds.length > 0;

                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => setSelectedChatId(chat.id)}
                      className={`group w-full border-l-4 px-5 py-4 text-left transition ${
                        isSelected
                          ? "border-emerald-400 bg-emerald-500/10"
                          : "border-transparent hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar user={otherUser} label={title} size="md" />
                          <span className="absolute bottom-0 right-0 rounded-full bg-[#17191f] p-1">
                            <PresenceDot online={hasOnlineMember} size="md" />
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <span className={`block truncate text-base font-bold ${isSelected ? "text-emerald-400" : "text-white"}`}>
                            {title}
                          </span>
                          <span
                            className={`mt-1 block truncate text-sm ${
                              isTypingInChat ? "font-semibold text-emerald-400" : "text-slate-400"
                            }`}
                          >
                            {isTypingInChat ? "Typing..." : subtitle}
                          </span>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span className="text-xs text-slate-400">
                            {new Date(chat.updatedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {hasOnlineMember ? (
                            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-[#07110d]">
                              On
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <span className="mt-2 block truncate pl-[60px] text-xs text-slate-500">
                        {presenceStatus}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 px-5 py-4 text-sm text-slate-400">
            <span className="flex items-center gap-2">
              <PresenceDot online size="md" />
              Online
            </span>
            <Link href="/profile" className="rounded-full px-3 py-1.5 transition hover:bg-white/[0.06] hover:text-white">
              Profile
            </Link>
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#111216]">
          <header className="border-b border-white/10 bg-[#15171c] px-5 py-4">
            {selectedChat ? (
              (() => {
                const otherMembers = getOtherMembers(selectedChat, user?.id);
                const otherUser = otherMembers[0]?.user;
                const title = getChatTitle(selectedChat, user?.id);
                const presenceStatus = getChatPresenceStatus(
                  otherMembers,
                  getPresence,
                );
                const hasOnlineMember = otherMembers.some((member) =>
                  isOnline(member.userId),
                );

                return (
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="relative">
                        <Avatar user={otherUser} label={title} size="md" />
                        <span className="absolute bottom-0 right-0 rounded-full bg-[#15171c] p-1">
                          <PresenceDot online={hasOnlineMember} size="md" />
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h1 className="truncate text-xl font-bold text-white">
                          {title}
                        </h1>
                        <p className="mt-1 flex items-center gap-2 truncate text-sm text-slate-400">
                          {hasOnlineMember ? <span className="h-2 w-2 rounded-full bg-emerald-400" /> : null}
                          {presenceStatus}
                        </p>
                      </div>
                    </div>

                    <form
                      onSubmit={handleMessageSearch}
                      className="flex min-w-0 items-center gap-2 xl:w-[420px]"
                    >
                      <input
                        value={messageSearchQuery}
                        onChange={(event) =>
                          setMessageSearchQuery(event.target.value)
                        }
                        placeholder="Search messages"
                        className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#20232b] px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
                      />
                      <button
                        type="submit"
                        disabled={messageSearchLoading}
                        aria-label="Search messages"
                        title="Search messages"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="7" />
                          <path d="m20 20-3.5-3.5" />
                        </svg>
                      </button>
                    </form>

                    {(messageSearchError || messageSearchResults.length > 0) && (
                      <div className="max-h-40 overflow-y-auto rounded-2xl border border-white/10 bg-[#20232b] xl:absolute xl:right-5 xl:top-20 xl:w-[420px]">
                        {messageSearchError ? (
                          <p className="px-4 py-3 text-xs text-red-200">
                            {messageSearchError}
                          </p>
                        ) : (
                          messageSearchResults.map((message) => (
                            <button
                              key={message.id}
                              type="button"
                              onClick={() => setHighlightedMessageId(message.id)}
                              className="block w-full border-b border-white/5 px-4 py-3 text-left last:border-0 hover:bg-white/[0.05]"
                            >
                              <span className="block truncate text-sm text-white/80">
                                {message.text ?? "Message"}
                              </span>
                              <span className="mt-1 block text-[11px] text-white/35">
                                {new Date(message.createdAt).toLocaleString()}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <>
                <h1 className="truncate text-xl font-bold">
                  Select a conversation
                </h1>
                <p className="mt-1 truncate text-sm text-slate-400">
                  Create or choose a chat
                </p>
              </>
            )}
          </header>

          {error && (
            <div className="mx-5 mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {selectedChatId && user ? (
            <MessageThread
              chatId={selectedChatId}
              currentUserId={user.id}
              chat={selectedChat}
              highlightedMessageId={highlightedMessageId}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="max-w-md text-center">
                <h2 className="text-xl font-bold">Ready for chats</h2>

                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Create a direct chat from the sidebar using another signed-in
                  user&apos;s phone number.
                </p>
              </div>
            </div>
          )}
        </section>
        </div>
      </main>
    </ProtectedRoute>
  );
}
