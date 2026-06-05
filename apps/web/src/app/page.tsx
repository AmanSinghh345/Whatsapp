"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChatDto } from "@chat/shared";
import { ProtectedRoute } from "../features/auth/components/protected-route";
import { useAuthStore } from "../features/auth/store/auth.store";
import { createDirectChat, fetchChats } from "../features/chat/api/chats.api";

import { MessageThread } from "../features/chat/components/MessageThread";

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const [chats, setChats] = useState<ChatDto[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [otherUserId, setOtherUserId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

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
    const trimmedUserId = otherUserId.trim();

    if (!trimmedUserId) {
      setError("Enter a user id to start a chat.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const chat = await createDirectChat({ otherUserId: trimmedUserId });
      setChats((current) => {
        const withoutDuplicate = current.filter((item) => item.id !== chat.id);
        return [chat, ...withoutDuplicate];
      });
      setSelectedChatId(chat.id);
      setOtherUserId("");
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

            <p className="mt-3 break-all rounded-md bg-white/[0.03] p-2 text-[11px] leading-4 text-white/45">
              Your user id: {user?.id}
            </p>
          </div>

          <form
            onSubmit={handleCreateDirectChat}
            className="border-b border-white/10 p-4"
          >
            <label
              htmlFor="other-user-id"
              className="mb-2 block text-xs font-medium text-white/65"
            >
              Start direct chat
            </label>
            <input
              id="other-user-id"
              value={otherUserId}
              onChange={(event) => setOtherUserId(event.target.value)}
              placeholder="Paste another user id"
              className="w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={isCreating}
              className="mt-3 w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreating ? "Creating..." : "Create chat"}
            </button>
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
                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => setSelectedChatId(chat.id)}
                      className={`w-full rounded-md px-3 py-3 text-left hover:bg-white/5 ${
                        isSelected ? "bg-white/10" : ""
                      }`}
                    >
                      <span className="block truncate text-sm font-medium">
                        {chat.title ?? `${chat.type} chat`}
                      </span>
                      <span className="mt-1 block truncate text-xs text-white/45">
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
            <h1 className="truncate text-lg font-semibold">
              {selectedChat
                ? selectedChat.title ?? `${selectedChat.type} chat`
                : "Select a conversation"}
            </h1>
            <p className="mt-1 truncate text-xs text-white/45">
              {selectedChat ? selectedChat.id : "Create or choose a chat"}
            </p>
          </header>

         {/* Error banner (chat-level errors, not message errors) */}
{error && (
  <div className="mx-6 mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
    {error}
  </div>
)}

{selectedChatId ? (
  <MessageThread
    chatId={selectedChatId}
    currentUserId={user!.id}   // ← the DB user id stored in your Zustand store
  />
) : (
  <div className="flex flex-1 items-center justify-center p-6">
    <div className="max-w-md text-center">
      <h2 className="text-xl font-semibold">Ready for chats</h2>
      <p className="mt-2 text-sm leading-6 text-white/55">
        Create a direct chat from the sidebar using another signed-in user's id.
      </p>
    </div>
  </div>
)}

        </section>
      </main>
    </ProtectedRoute>
  );
}
