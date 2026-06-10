import type { ChatDto, UserDto } from "@chat/shared";
import { ChatListItem } from "./ChatListItem";
import {
  getChatPresenceStatus,
  getChatTitle,
  getOtherMembers,
  type DisplayChat,
  type PresenceView,
} from "./chat-display";

interface ChatSidebarProps {
  user: UserDto | null;
  chats: DisplayChat[];
  selectedChatId: string | null;
  searchQuery: string;
  loading: boolean;
  error: string | null;
  isCreating: boolean;
  phoneSearch: string;
  isOpen: boolean;
  getPresence: (userId: string) => PresenceView | undefined;
  isOnline: (userId: string) => boolean;
  onSearchChange: (value: string) => void;
  onPhoneSearchChange: (value: string) => void;
  onCreateDirectChat: (event: React.FormEvent<HTMLFormElement>) => void;
  onSelectChat: (chatId: ChatDto["id"]) => void;
  onRefresh: () => void;
  onCloseMobile: () => void;
}

export function ChatSidebar({
  user,
  chats,
  selectedChatId,
  searchQuery,
  loading,
  error,
  isCreating,
  phoneSearch,
  isOpen,
  getPresence,
  isOnline,
  onSearchChange,
  onPhoneSearchChange,
  onCreateDirectChat,
  onSelectChat,
  onRefresh,
  onCloseMobile,
}: ChatSidebarProps) {
  const filteredChats = chats.filter((chat) =>
    getChatTitle(chat, user?.id).toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <>
      {isOpen ? (
        <button
          type="button"
          aria-label="Close conversations"
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
        />
      ) : null}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-[min(88vw,340px)] shrink-0 flex-col border-r border-white/10 bg-[#111827]/95 shadow-2xl shadow-black/40 backdrop-blur-xl transition-transform md:static md:z-auto md:w-[326px] md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-300/80">
                Workspace
              </p>
              <h1 className="mt-1 truncate text-lg font-bold text-white">
                {user?.displayName ?? "Chats"}
              </h1>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sync
            </button>
          </div>

          <label className="mt-4 block">
            <span className="sr-only">Search chats</span>
            <input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search conversations"
              className="h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:bg-black/30"
            />
          </label>
        </div>

        <form
          onSubmit={onCreateDirectChat}
          className="border-b border-white/10 bg-white/[0.025] p-4"
        >
          <label className="block text-xs font-medium text-slate-400">
            Start direct chat
            <input
              value={phoneSearch}
              onChange={(event) => onPhoneSearchChange(event.target.value)}
              placeholder="+919876543210"
              className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50"
            />
          </label>
          <button
            type="submit"
            disabled={isCreating}
            className="mt-3 h-10 w-full rounded-xl bg-cyan-400 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreating ? "Searching" : "Create chat"}
          </button>
        </form>

        {error ? (
          <div className="mx-4 mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Recent
            </h2>
            <span className="text-xs text-slate-500">{filteredChats.length}</span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-[74px] animate-pulse rounded-xl bg-white/[0.045]"
                />
              ))}
            </div>
          ) : filteredChats.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-slate-400">
              No conversations match that search.
            </p>
          ) : (
            <div className="space-y-1">
              {filteredChats.map((chat) => {
                const otherMembers = getOtherMembers(chat, user?.id);
                const online = otherMembers.some((member) =>
                  isOnline(member.userId),
                );
                const presenceText = getChatPresenceStatus(
                  otherMembers,
                  getPresence,
                );

                return (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    currentUserId={user?.id}
                    active={chat.id === selectedChatId}
                    online={online}
                    presenceText={presenceText}
                    onSelect={(chatId) => {
                      onSelectChat(chatId);
                      onCloseMobile();
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
