"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ChatDto, ChatMemberDto, UserDto } from "@chat/shared";
import { ProtectedRoute } from "../features/auth/components/protected-route";
import { useAuthStore } from "../features/auth/store/auth.store";
import { createDirectChat, fetchChats } from "../features/chat/api/chats.api";
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

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const otherUserIds = useMemo(() => {
    if (!user) return [];

    const ids = chats.flatMap((chat) => getOtherMemberIds(chat, user.id));
    return Array.from(new Set(ids));
  }, [chats, user?.id]);

  const { isOnline } = usePresence(otherUserIds);

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

  useEffect(() => {
    if (user) {
      void loadChats();
    }
  }, [user?.id]);

  return (
    <ProtectedRoute>
      <main className="flex h-screen bg-zinc-950 text-zinc-50">
        <aside className="flex w-80 shrink-0 flex-col border-r border-white/10">
          <div className="border-b border-white/10 p-4">
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
                className="rounded-md border border-white/15 px-2 py-1 text-xs font-medium text-white/80 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            <Link
              href="/profile"
              className="mt-3 flex items-center gap-3 rounded-md bg-white/[0.03] p-2 hover:bg-white/[0.06]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-700 text-sm font-semibold">
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
            className="border-b border-white/10 p-4"
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
              className="w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-emerald-500"
            />

            <button
              type="submit"
              disabled={isCreating}
              className="mt-3 w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreating ? "Searching..." : "Find and create chat"}
            </button>
            <p className="mt-2 text-[11px] leading-4 text-white/40">
              Use full E.164 format, for example +917999106835.
            </p>
          </form>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
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

                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => setSelectedChatId(chat.id)}
                      className={`w-full rounded-md px-3 py-3 text-left hover:bg-white/5 ${
                        isSelected ? "bg-white/10" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar user={otherUser} label={title} />
                          <span className="absolute bottom-0 right-0 rounded-full bg-zinc-950 p-0.5">
                            <PresenceDot online={hasOnlineMember} />
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {title}
                          </span>
                          <span className="mt-1 block truncate text-xs text-white/45">
                            {subtitle}
                          </span>
                        </div>
                      </div>

                      <span className="mt-2 block truncate pl-[52px] text-xs text-white/35">
                        Updated {new Date(chat.updatedAt).toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-white/10 px-6 py-4">
            {selectedChat ? (
              <div className="flex items-center gap-3">
                <Avatar
                  user={getOtherMembers(selectedChat, user?.id)[0]?.user}
                  label={getChatTitle(selectedChat, user?.id)}
                />
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold">
                    {getChatTitle(selectedChat, user?.id)}
                  </h1>
                  <p className="mt-1 truncate text-xs text-white/45">
                    {getChatSubtitle(selectedChat, user?.id)}
                  </p>
                </div>
              </div>
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
            <MessageThread chatId={selectedChatId} currentUserId={user.id} />
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
