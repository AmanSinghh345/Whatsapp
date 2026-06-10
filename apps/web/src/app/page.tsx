"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

function Avatar({ user, label }: { user?: UserDto | undefined; label: string }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-700 text-sm font-semibold">
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
    setMessageSearchQuery("");
    setMessageSearchResults([]);
    setMessageSearchError(null);
    setHighlightedMessageId(null);
  }, [selectedChatId]);

  return (
    <ProtectedRoute>
      <main className="flex h-screen bg-[#071018] text-zinc-50">
        <aside className="flex w-80 shrink-0 flex-col border-r border-cyan-200/10 bg-[#0b1720]/95 shadow-2xl shadow-black/30">
          <div className="border-b border-cyan-200/10 bg-gradient-to-br from-cyan-950/35 via-slate-950/20 to-emerald-950/25 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">
                  {user?.displayName}
                </h2>

                <p className="mt-1 truncate text-xs text-white/55">
                  {user?.email ?? user?.phoneE164 ?? user?.id}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadChats()}
                disabled={isLoading}
                className="rounded-md border border-cyan-100/15 bg-white/[0.03] px-2 py-1 text-xs font-medium text-white/80 hover:bg-cyan-100/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            <Link
              href="/profile"
              className="mt-3 flex items-center gap-3 rounded-md bg-cyan-100/[0.05] p-2 hover:bg-cyan-100/[0.09]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-emerald-500 to-cyan-700 text-sm font-semibold">
                {user?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  user?.displayName.slice(0, 1).toUpperCase() ?? "U"
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-white/75">
                  View profile
                </p>
                <p className="truncate text-[11px] text-white/40">
                  {user?.phoneE164 ?? "Add your phone number"}
                </p>
              </div>
            </Link>
          </div>

          <form
            onSubmit={handleCreateDirectChat}
            className="border-b border-cyan-200/10 bg-[#09141d]/80 p-4"
          >
            <label
              htmlFor="other-user-id"
              className="mb-2 block text-xs font-medium text-white/65"
            >
              Start direct chat by phone
            </label>

            <input
              id="other-user-id"
              value={phoneSearch}
              onChange={(event) => setPhoneSearch(event.target.value)}
              placeholder="+919876543210"
              className="w-full rounded-md border border-cyan-100/15 bg-white/[0.04] px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-cyan-400"
            />

            <button
              type="submit"
              disabled={isCreating}
              className="mt-3 w-full rounded-md bg-gradient-to-r from-emerald-600 to-cyan-600 px-3 py-2 text-sm font-medium text-white hover:from-emerald-500 hover:to-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreating ? "Searching..." : "Find and create chat"}
            </button>
            <p className="mt-2 text-[11px] leading-4 text-white/40">
              Use full E.164 format, for example +917999106835.
            </p>
          </form>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#071018]/70 p-2">
            {isLoading ? (
              <p className="px-2 py-3 text-sm text-white/55">Loading chats...</p>
            ) : chats.length === 0 ? (
              <p className="px-2 py-3 text-sm text-white/55">No chats yet</p>
            ) : (
              <div className="space-y-1">
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

                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => setSelectedChatId(chat.id)}
                      className={`w-full rounded-md px-3 py-3 text-left hover:bg-cyan-100/[0.07] ${
                        isSelected ? "bg-cyan-100/[0.11]" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar user={otherUser} label={title} />
                          <span className="absolute bottom-0 right-0 rounded-full bg-[#071018] p-0.5">
                            <PresenceDot online={hasOnlineMember} />
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {title}
                          </span>
                          <span className="mt-1 block truncate text-xs text-white/45">
                            {presenceStatus}
                          </span>
                        </div>
                      </div>

                      <span className="mt-2 block truncate pl-[52px] text-xs text-white/35">
                        {subtitle}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-[#071018]">
          <header className="border-b border-cyan-200/10 bg-[#0b1720]/80 px-6 py-4 shadow-lg shadow-black/20 backdrop-blur-md">
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
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar user={otherUser} label={title} />
                        <span className="absolute bottom-0 right-0 rounded-full bg-[#0b1720] p-0.5">
                          <PresenceDot online={hasOnlineMember} />
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h1 className="truncate text-lg font-semibold">
                          {title}
                        </h1>
                        <p className="mt-1 truncate text-xs text-white/45">
                          {presenceStatus}
                        </p>
                      </div>
                    </div>

                    <form
                      onSubmit={handleMessageSearch}
                      className="flex items-center gap-2"
                    >
                      <input
                        value={messageSearchQuery}
                        onChange={(event) =>
                          setMessageSearchQuery(event.target.value)
                        }
                        placeholder="Search messages"
                        className="min-w-0 flex-1 rounded-md border border-cyan-100/15 bg-white/[0.04] px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-cyan-400"
                      />
                      <button
                        type="submit"
                        disabled={messageSearchLoading}
                        className="rounded-md border border-cyan-100/15 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/80 hover:bg-cyan-100/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {messageSearchLoading ? "Searching" : "Search"}
                      </button>
                    </form>

                    {(messageSearchError || messageSearchResults.length > 0) && (
                      <div className="max-h-40 overflow-y-auto rounded-md border border-cyan-100/10 bg-slate-950/65">
                        {messageSearchError ? (
                          <p className="px-3 py-2 text-xs text-red-200">
                            {messageSearchError}
                          </p>
                        ) : (
                          messageSearchResults.map((message) => (
                            <button
                              key={message.id}
                              type="button"
                              onClick={() => setHighlightedMessageId(message.id)}
                              className="block w-full border-b border-white/5 px-3 py-2 text-left last:border-0 hover:bg-cyan-100/[0.06]"
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
                <h1 className="truncate text-lg font-semibold">
                  Select a conversation
                </h1>
                <p className="mt-1 truncate text-xs text-white/45">
                  Create or choose a chat
                </p>
              </>
            )}
          </header>

          {error && (
            <div className="mx-6 mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          {selectedChatId && user ? (
            <MessageThread
              chatId={selectedChatId}
              currentUserId={user.id}
              highlightedMessageId={highlightedMessageId}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="max-w-md text-center">
                <h2 className="text-xl font-semibold">Ready for chats</h2>

                <p className="mt-2 text-sm leading-6 text-white/55">
                  Create a direct chat from the sidebar using another signed-in
                  user&apos;s phone number.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </ProtectedRoute>
  );
}
