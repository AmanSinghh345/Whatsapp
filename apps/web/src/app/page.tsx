"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ChatDto, ChatInviteDto, ChatMemberDto, UserDto } from "@chat/shared";
import { ProtectedRoute } from "../features/auth/components/protected-route";
import { useAuthStore } from "../features/auth/store/auth.store";
import {
  addGroupMembers,
  createChatInvite,
  createDirectChat,
  createGroupChat,
  fetchActiveChatInvite,
  fetchChats,
  joinChatByInvite,
  leaveGroup,
  removeGroupMember,
  revokeChatInvite,
  updateChatMemberRole,
  updateGroupChat,
} from "../features/chat/api/chats.api";
import {
  searchMessages,
  type MessageDto,
} from "../features/chat/api/messages.api";
import { uploadGroupAvatar } from "../features/chat/api/media.api";
import { CallPanel } from "../features/chat/components/CallPanel";
import { MessageThread } from "../features/chat/components/MessageThread";
import { useLiveChatPreviews } from "../features/chat/hooks/useLiveChatPreviews";
import { usePresence } from "../features/realtime/usePresence";
import { useBrowserNotifications } from "../features/realtime/useBrowserNotifications";
import { getSocket } from "../features/realtime/socket.client";
import { useGlobalTypingListener } from "../features/realtime/useTypingIndicator";
import { useTypingStore } from "../features/realtime/typing.store";
import { useWebRtcCall } from "../features/realtime/useWebRtcCall";
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

function parseInviteToken(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    return url.searchParams.get("invite") ?? trimmed;
  } catch {
    return trimmed;
  }
}

type PresenceView = {
  state: "online" | "offline";
  lastSeenAt?: string;
};

type CreatePanelTab = "direct" | "group" | "invite";
type ChatTypeFilter = "all" | "group" | "direct";

function formatLastSeenTime(lastSeenAt: string) {
  const lastSeen = new Date(lastSeenAt);
  const lastSeenTime = lastSeen.getTime();

  if (Number.isNaN(lastSeenTime)) {
    return null;
  }

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - lastSeenTime);
  const minutesAgo = Math.floor(diffMs / 60_000);

  if (minutesAgo < 1) {
    return "just now";
  }

  if (minutesAgo < 60) {
    return `${minutesAgo} min ago`;
  }

  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) {
    return `${hoursAgo} hr${hoursAgo === 1 ? "" : "s"} ago`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (lastSeen.toDateString() === yesterday.toDateString()) {
    return "yesterday";
  }

  const daysAgo = Math.floor(diffMs / 86_400_000);
  if (daysAgo < 7) {
    return lastSeen.toLocaleDateString([], { weekday: "short" });
  }

  return lastSeen.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatChatListTime(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatPresenceStatus(presence?: PresenceView, fallbackLastSeenAt?: string) {
  if (presence?.state === "online") {
    return "Online";
  }

  const lastSeenAt = presence?.lastSeenAt ?? fallbackLastSeenAt;

  if (!lastSeenAt) {
    return "Offline";
  }

  const lastSeenLabel = formatLastSeenTime(lastSeenAt);

  return lastSeenLabel ? `Last seen ${lastSeenLabel}` : "Offline";
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
  imageUrl,
}: {
  user?: UserDto | undefined;
  label: string;
  size?: "sm" | "md" | "lg";
  imageUrl?: string | undefined;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass =
    size === "lg" ? "h-14 w-14 text-lg" : size === "sm" ? "h-11 w-11" : "h-12 w-12";
  const avatarUrl = imageUrl ?? user?.avatarUrl;

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <div
      className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-emerald-500 to-slate-700 text-sm font-semibold text-white ring-1 ring-white/10`}
    >
      {avatarUrl && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        label.slice(0, 1).toUpperCase() || "U"
      )}
    </div>
  );
}

function VideoCallIcon() {
  return (
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
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return text;
  }

  const matchIndex = text.toLowerCase().indexOf(trimmedQuery.toLowerCase());

  if (matchIndex < 0) {
    return text;
  }

  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + trimmedQuery.length);
  const after = text.slice(matchIndex + trimmedQuery.length);

  return (
    <>
      {before}
      <mark className="rounded bg-emerald-400/20 px-0.5 text-emerald-100">
        {match}
      </mark>
      {after}
    </>
  );
}

function AppToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-none fixed right-3 top-3 z-50 w-[min(360px,calc(100vw-1.5rem))]">
      <div className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-red-300/20 bg-[#24181c]/95 px-4 py-3 text-sm text-red-100 shadow-2xl shadow-black/40 backdrop-blur">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-100">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
        </div>
        <p className="min-w-0 flex-1 leading-5">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-red-100/70 transition hover:bg-white/10 hover:text-white"
          aria-label="Dismiss"
          title="Dismiss"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ActiveChatPane({
  chat,
  user,
  getPresence,
  isOnline,
  messageSearchQuery,
  messageSearchResults,
  messageSearchLoading,
  messageSearchError,
  highlightedMessageId,
  groupTitleDraft,
  groupMemberPhoneSearch,
  groupInvite,
  groupInviteUrl,
  groupAvatarPending,
  groupDetailsPending,
  groupMemberActionPending,
  leaveGroupPending,
  groupInvitePending,
  removingGroupMemberIds,
  updatingRoleMemberIds,
  onMessageSearchChange,
  onMessageSearch,
  onClearMessageSearch,
  onHighlightMessage,
  onGroupTitleDraftChange,
  onGroupAvatarSelected,
  onSaveGroupDetails,
  onCreateGroupInvite,
  onCopyGroupInvite,
  onRevokeGroupInvite,
  onGroupMemberPhoneSearchChange,
  onAddGroupMember,
  onRemoveGroupMember,
  onUpdateGroupMemberRole,
  onLeaveGroup,
  onBackToChats,
}: {
  chat: ChatDto;
  user: UserDto;
  getPresence: (userId: string) => PresenceView | undefined;
  isOnline: (userId: string) => boolean;
  messageSearchQuery: string;
  messageSearchResults: MessageDto[];
  messageSearchLoading: boolean;
  messageSearchError: string | null;
  highlightedMessageId: string | null;
  groupTitleDraft: string;
  groupMemberPhoneSearch: string;
  groupInvite: ChatInviteDto | null;
  groupInviteUrl: string;
  groupAvatarPending: boolean;
  groupDetailsPending: boolean;
  groupMemberActionPending: boolean;
  leaveGroupPending: boolean;
  groupInvitePending: boolean;
  removingGroupMemberIds: Set<string>;
  updatingRoleMemberIds: Set<string>;
  onMessageSearchChange: (value: string) => void;
  onMessageSearch: (event: FormEvent<HTMLFormElement>) => void;
  onClearMessageSearch: () => void;
  onHighlightMessage: (messageId: string) => void;
  onGroupTitleDraftChange: (value: string) => void;
  onGroupAvatarSelected: (file: File) => void;
  onSaveGroupDetails: (event: FormEvent<HTMLFormElement>) => void;
  onCreateGroupInvite: () => void;
  onCopyGroupInvite: () => void;
  onRevokeGroupInvite: () => void;
  onGroupMemberPhoneSearchChange: (value: string) => void;
  onAddGroupMember: (event: FormEvent<HTMLFormElement>) => void;
  onRemoveGroupMember: (userId: string) => void;
  onUpdateGroupMemberRole: (
    userId: string,
    role: ChatMemberDto["role"],
  ) => void;
  onLeaveGroup: () => void;
  onBackToChats: () => void;
}) {
  const otherMembers = getOtherMembers(chat, user.id);
  const otherUser = otherMembers[0]?.user;
  const title = getChatTitle(chat, user.id);
  const presenceStatus = getChatPresenceStatus(otherMembers, getPresence);
  const hasOnlineMember = otherMembers.some((member) => isOnline(member.userId));
  const callPeer =
    chat.type === "direct" && otherMembers.length === 1
      ? otherMembers[0]
      : undefined;
  const call = useWebRtcCall({
    chat,
    currentUserId: user.id,
    ...(callPeer ? { peerUserId: callPeer.userId } : {}),
  });
  const activeCallPeer =
    otherMembers.find((member) => member.userId === call.peerUserId) ?? callPeer;
  const activeCallPeerName =
    activeCallPeer?.user?.displayName ??
    activeCallPeer?.user?.phoneE164 ??
    activeCallPeer?.user?.email ??
    "Caller";
  const callAvailable = Boolean(callPeer);
  const currentMember = chat.members?.find((member) => member.userId === user.id);
  const canManageGroup = chat.type === "group" && currentMember?.role === "admin";
  const [detailsOpen, setDetailsOpen] = useState(false);
  const trimmedSearchQuery = messageSearchQuery.trim();
  const showSearchResults = trimmedSearchQuery.length > 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="relative shrink-0 border-b border-white/10 bg-[#15171c]/95 px-4 py-2.5 sm:px-5">
        <div className="flex min-w-0 flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onBackToChats}
              aria-label="Back to chats"
              title="Back to chats"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white lg:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="group flex min-w-0 items-center gap-3 rounded-2xl px-1.5 py-1 text-left transition hover:bg-white/[0.045] focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
          >
            <div className="relative">
              <Avatar
                user={chat.type === "group" ? undefined : otherUser}
                label={title}
                size="md"
                imageUrl={chat.type === "group" ? chat.avatarUrl : undefined}
              />
              <span className="absolute bottom-0 right-0 rounded-full bg-[#15171c] p-1">
                <PresenceDot online={hasOnlineMember} size="md" />
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-lg font-bold text-white">{title}</h1>
                <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 transition group-hover:text-slate-300 sm:inline-flex">
                  Info
                </span>
              </div>
              <p className="mt-0.5 flex items-center gap-2 truncate text-xs text-slate-400">
                {hasOnlineMember ? (
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                ) : null}
                {presenceStatus}
              </p>
            </div>
          </button>
          </div>

          <div className="relative flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-black/10 p-1 xl:w-[min(42vw,480px)]">
            <form
              onSubmit={onMessageSearch}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-transparent bg-[#20232b] px-3 py-2 text-slate-400 transition focus-within:border-emerald-400/50 focus-within:bg-[#242832]"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={messageSearchQuery}
                onChange={(event) => onMessageSearchChange(event.target.value)}
                placeholder="Search messages"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
              {trimmedSearchQuery ? (
                <button
                  type="button"
                  onClick={onClearMessageSearch}
                  aria-label="Clear message search"
                  title="Clear"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              ) : null}
            </form>

            <button
              type="button"
              aria-label="Start video call"
              title={
                callAvailable
                  ? "Start video call"
                  : "Video calls are available in direct chats"
              }
              onClick={call.startCall}
              disabled={!callAvailable || call.phase !== "idle"}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/12 text-emerald-300 transition hover:bg-emerald-500/20 hover:text-emerald-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-slate-500"
            >
              <VideoCallIcon />
            </button>
          </div>

          {showSearchResults ? (
            <div className="absolute right-14 top-[54px] z-30 max-h-72 w-[min(420px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-white/10 bg-[#20232b]/98 p-2 shadow-2xl shadow-black/40 backdrop-blur">
              <div className="flex items-center justify-between px-2 pb-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Search messages
                </p>
                {messageSearchLoading ? (
                  <span className="text-xs text-emerald-300">Searching...</span>
                ) : null}
              </div>
              {messageSearchError ? (
                <p className="rounded-xl border border-red-300/15 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  {messageSearchError}
                </p>
              ) : !messageSearchLoading && trimmedSearchQuery.length < 2 ? (
                <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-400">
                  Enter at least 2 characters.
                </p>
              ) : !messageSearchLoading && messageSearchResults.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-400">
                  No messages found
                </p>
              ) : null}

              {messageSearchResults.length > 0 ? (
                <div className="space-y-1">
                  {messageSearchResults.map((message) => (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => onHighlightMessage(message.id)}
                    className="block w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
                  >
                    <span className="block truncate text-sm leading-5 text-white/85">
                      <HighlightedText text={message.text ?? "Message"} query={trimmedSearchQuery} />
                    </span>
                    <span className="mt-1 block text-[11px] text-white/35">
                      {new Date(message.createdAt).toLocaleString()}
                    </span>
                  </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {detailsOpen ? (
        <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[min(430px,100%)] flex-col border-l border-white/10 bg-[#15171c] shadow-2xl shadow-black/50">
          <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-4">
            <button
              type="button"
              onClick={() => setDetailsOpen(false)}
              aria-label="Close details"
              title="Close details"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <h2 className="truncate text-base font-bold text-white">
              {chat.type === "group" ? "Group info" : "Contact info"}
            </h2>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {chat.type === "group" ? "Group overview" : "Contact overview"}
              </p>
              <div className="flex flex-col items-center text-center">
              <Avatar
                user={chat.type === "group" ? undefined : otherUser}
                label={title}
                size="lg"
                imageUrl={chat.type === "group" ? chat.avatarUrl : undefined}
              />
              <h3 className="mt-3 max-w-full truncate text-xl font-bold text-white">
                {title}
              </h3>
              <p className="mt-1 truncate text-sm text-slate-400">
                {chat.type === "group"
                  ? `${chat.members?.length ?? 0} members`
                  : presenceStatus}
              </p>
              </div>
            </section>

            {chat.type === "direct" ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-white/10 bg-[#20232b] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Phone
                  </p>
                  <p className="mt-2 truncate text-sm text-slate-100">
                    {otherUser?.phoneE164 ?? "Not available"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#20232b] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Email
                  </p>
                  <p className="mt-2 truncate text-sm text-slate-100">
                    {otherUser?.email ?? "Not available"}
                  </p>
                </div>
              </div>
            ) : null}

            {chat.type === "group" ? (
              <div className="space-y-4">
                <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
                    Members
                  </p>
                  <div className="mt-3 space-y-2">
                    {(chat.members ?? []).map((member) => {
                      const memberName =
                        member.user?.displayName ??
                        member.user?.phoneE164 ??
                        member.user?.email ??
                        "Member";
                      const isCurrentUser = member.userId === user.id;
                      const canRemove =
                        canManageGroup &&
                        !isCurrentUser &&
                        (chat.members?.length ?? 0) > 2;
                      const nextRole =
                        member.role === "admin" ? "member" : "admin";
                      const canChangeRole = canManageGroup && !isCurrentUser;

                      return (
                        <div
                          key={member.userId}
                          className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-[#20232b]/80 px-3 py-2.5"
                        >
                          <Avatar user={member.user} label={memberName} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-white">
                              {memberName}
                            </p>
                            <p className="mt-1 inline-flex rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              {member.role}
                            </p>
                          </div>
                          {canChangeRole ? (
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateGroupMemberRole(member.userId, nextRole)
                              }
                              disabled={updatingRoleMemberIds.has(member.userId)}
                              className="h-7 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2.5 text-[11px] font-bold text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {nextRole === "admin" ? "Promote" : "Demote"}
                            </button>
                          ) : null}
                          {canRemove ? (
                            <button
                              type="button"
                              onClick={() => onRemoveGroupMember(member.userId)}
                              disabled={removingGroupMemberIds.has(member.userId)}
                              aria-label={`Remove ${memberName}`}
                              title={`Remove ${memberName}`}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-red-300/15 bg-red-500/10 text-red-100/80 transition hover:bg-red-500/15 hover:text-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              x
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {canManageGroup ? (
                  <>
                  <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Group actions
                    </p>
                    <label className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-sm font-bold text-slate-100 transition hover:bg-white/[0.1]">
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={groupAvatarPending}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";

                          if (file) {
                            onGroupAvatarSelected(file);
                          }
                        }}
                      />
                      {groupAvatarPending ? "Uploading avatar" : "Change avatar"}
                    </label>

                    <form onSubmit={onSaveGroupDetails} className="flex min-w-0 gap-2">
                      <input
                        id="group-title-draft"
                        value={groupTitleDraft}
                        onChange={(event) =>
                          onGroupTitleDraftChange(event.target.value)
                        }
                        placeholder="Group name"
                        className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#20232b] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
                      />
                      <button
                        type="submit"
                        disabled={groupDetailsPending}
                        className="h-11 shrink-0 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-bold text-slate-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {groupDetailsPending ? "Saving" : "Save"}
                      </button>
                    </form>

                    <form onSubmit={onAddGroupMember} className="flex min-w-0 gap-2">
                      <input
                        id="active-group-member-phone"
                        value={groupMemberPhoneSearch}
                        onChange={(event) =>
                          onGroupMemberPhoneSearchChange(event.target.value)
                        }
                        placeholder="Add member phone"
                        className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#20232b] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
                      />
                      <button
                        type="submit"
                        disabled={groupMemberActionPending}
                        className="h-11 shrink-0 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-[#07110d] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {groupMemberActionPending ? "Adding" : "Add"}
                      </button>
                    </form>
                  </section>

                  <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Invite link
                    </p>
                    <div className="min-w-0 rounded-xl border border-white/10 bg-[#20232b] p-3">
                      {groupInvite ? (
                        <p className="truncate pb-3 text-xs text-slate-300">
                          {groupInviteUrl}
                        </p>
                      ) : (
                        <p className="pb-3 text-xs text-slate-500">
                          Generate an invite link to let people join this group.
                        </p>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={onCreateGroupInvite}
                          disabled={groupInvitePending}
                          className="h-10 rounded-lg border border-white/10 bg-white/[0.06] px-2 text-xs font-bold text-slate-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {groupInvite ? "Regenerate" : "Generate"}
                        </button>
                        <button
                          type="button"
                          onClick={onCopyGroupInvite}
                          disabled={!groupInvite || groupInvitePending}
                          className="h-10 rounded-lg border border-emerald-300/20 bg-emerald-500/10 px-2 text-xs font-bold text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={onRevokeGroupInvite}
                          disabled={!groupInvite || groupInvitePending}
                          className="h-10 rounded-lg border border-red-300/20 bg-red-500/10 px-2 text-xs font-bold text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  </section>
                  </>
                ) : null}

                <section className="rounded-2xl border border-red-300/15 bg-red-500/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-200/70">
                    Danger zone
                  </p>
                  <button
                    type="button"
                    onClick={onLeaveGroup}
                    disabled={leaveGroupPending}
                    className="mt-3 h-10 w-full rounded-xl border border-red-300/20 bg-red-500/10 text-sm font-bold text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {leaveGroupPending ? "Leaving" : "Leave group"}
                  </button>
                </section>
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}

      <CallPanel
        phase={call.phase}
        peerName={activeCallPeerName}
        localStream={call.localStream}
        remoteStream={call.remoteStream}
        error={call.error}
        isMicMuted={call.isMicMuted}
        isCameraOff={call.isCameraOff}
        debugState={call.debugState}
        onAccept={call.acceptCall}
        onDecline={call.endCall}
        onEnd={call.endCall}
        onToggleMic={call.toggleMic}
        onToggleCamera={call.toggleCamera}
      />

      <MessageThread
        chatId={chat.id}
        currentUserId={user.id}
        chat={chat}
        highlightedMessageId={highlightedMessageId}
      />
    </div>
  );
}

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const joinedChatIdsRef = useRef<Set<string>>(new Set());

  const [chats, setChats] = useState<ChatDto[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [chatTypeFilter, setChatTypeFilter] = useState<ChatTypeFilter>("all");
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [createPanelTab, setCreatePanelTab] = useState<CreatePanelTab>("direct");
  const [phoneSearch, setPhoneSearch] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupPhoneSearch, setGroupPhoneSearch] = useState("");
  const [groupMembers, setGroupMembers] = useState<UserDto[]>([]);
  const [inviteJoinInput, setInviteJoinInput] = useState("");
  const [activeGroupMemberPhoneSearch, setActiveGroupMemberPhoneSearch] =
    useState("");
  const [activeGroupTitleDraft, setActiveGroupTitleDraft] = useState("");
  const [activeGroupInvite, setActiveGroupInvite] =
    useState<ChatInviteDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isAddingGroupMember, setIsAddingGroupMember] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isManagingGroupMember, setIsManagingGroupMember] = useState(false);
  const [isUpdatingGroupDetails, setIsUpdatingGroupDetails] = useState(false);
  const [isUpdatingGroupAvatar, setIsUpdatingGroupAvatar] = useState(false);
  const [isLeavingGroup, setIsLeavingGroup] = useState(false);
  const [isJoiningInvite, setIsJoiningInvite] = useState(false);
  const [isLoadingInvite, setIsLoadingInvite] = useState(false);
  const [isUpdatingInvite, setIsUpdatingInvite] = useState(false);
  const [removingGroupMemberIds, setRemovingGroupMemberIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [updatingRoleMemberIds, setUpdatingRoleMemberIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [messageSearchResults, setMessageSearchResults] = useState<MessageDto[]>([]);
  const [messageSearchLoading, setMessageSearchLoading] = useState(false);
  const [messageSearchError, setMessageSearchError] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(
    null,
  );
  const typingByChatId = useTypingStore((state) => state.typingByChatId);

  useGlobalTypingListener();

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );
  const filteredChats = useMemo(() => {
    const query = chatSearchQuery.trim().toLowerCase();

    return chats.filter((chat) => {
      if (chatTypeFilter !== "all" && chat.type !== chatTypeFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const title = getChatTitle(chat, user?.id).toLowerCase();
      const subtitle = getChatSubtitle(chat, user?.id).toLowerCase();
      const preview = (chat.lastMessagePreview ?? "").toLowerCase();

      return (
        title.includes(query) ||
        subtitle.includes(query) ||
        preview.includes(query)
      );
    });
  }, [chatSearchQuery, chatTypeFilter, chats, user?.id]);
  const selectedChatMembership = selectedChat?.members?.find(
    (member) => member.userId === user?.id,
  );
  const canManageSelectedGroupInvite =
    selectedChat?.type === "group" && selectedChatMembership?.role === "admin";
  const activeGroupInviteUrl = activeGroupInvite
    ? `${typeof window === "undefined" ? "" : window.location.origin}/?invite=${activeGroupInvite.token}`
    : "";

  const otherUserIds = useMemo(() => {
    if (!user) return [];

    const ids = chats.flatMap((chat) => getOtherMemberIds(chat, user.id));
    return Array.from(new Set(ids));
  }, [chats, user?.id]);

  const { getPresence, isOnline } = usePresence(otherUserIds);
  useBrowserNotifications({
    chats,
    currentUserId: user?.id,
    selectedChatId,
    onSelectChat: setSelectedChatId,
  });
  useLiveChatPreviews({
    currentUserId: user?.id,
    selectedChatId,
    setChats,
  });

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
      setCreatePanelOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to create chat.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleAddGroupMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedPhone = groupPhoneSearch.trim();
    if (!trimmedPhone) {
      setError("Enter a phone number to add to the group.");
      return;
    }

    setIsAddingGroupMember(true);
    setError(null);

    try {
      const foundUser = await searchUserByPhone(trimmedPhone);
      if (foundUser.id === user?.id) {
        throw new Error("You are already included as the group admin.");
      }

      setGroupMembers((current) => {
        if (current.some((member) => member.id === foundUser.id)) {
          return current;
        }

        return [...current, foundUser];
      });
      setGroupPhoneSearch("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to add member.");
    } finally {
      setIsAddingGroupMember(false);
    }
  }

  async function handleCreateGroupChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = groupTitle.trim();
    if (!trimmedTitle) {
      setError("Enter a group name.");
      return;
    }

    if (groupMembers.length === 0) {
      setError("Add at least one member to create a group.");
      return;
    }

    setIsCreatingGroup(true);
    setError(null);

    try {
      const chat = await createGroupChat({
        title: trimmedTitle,
        memberUserIds: groupMembers.map((member) => member.id),
      });
      setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
      setSelectedChatId(chat.id);
      setGroupTitle("");
      setGroupPhoneSearch("");
      setGroupMembers([]);
      setCreatePanelOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to create group.");
    } finally {
      setIsCreatingGroup(false);
    }
  }

  async function handleAddMemberToSelectedGroup(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const selectedChat = chats.find((chat) => chat.id === selectedChatId);
    const trimmedPhone = activeGroupMemberPhoneSearch.trim();

    if (!selectedChat || selectedChat.type !== "group") {
      return;
    }

    if (!trimmedPhone) {
      setError("Enter a phone number to add to this group.");
      return;
    }

    setIsManagingGroupMember(true);
    setError(null);

    try {
      const foundUser = await searchUserByPhone(trimmedPhone);
      if (selectedChat.members?.some((member) => member.userId === foundUser.id)) {
        throw new Error("That user is already in this group.");
      }

      const updatedChat = await addGroupMembers(selectedChat.id, [foundUser.id]);
      setChats((current) =>
        current.map((chat) => (chat.id === updatedChat.id ? updatedChat : chat)),
      );
      setActiveGroupMemberPhoneSearch("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to add member.");
    } finally {
      setIsManagingGroupMember(false);
    }
  }

  async function handleRemoveMemberFromSelectedGroup(userId: string) {
    const selectedChat = chats.find((chat) => chat.id === selectedChatId);

    if (!selectedChat || selectedChat.type !== "group") {
      return;
    }

    setRemovingGroupMemberIds((current) => {
      const next = new Set(current);
      next.add(userId);
      return next;
    });
    setError(null);

    try {
      await removeGroupMember(selectedChat.id, userId);
      const updatedChat = {
        ...selectedChat,
        ...(selectedChat.members
          ? {
              members: selectedChat.members.filter(
                (member) => member.userId !== userId,
              ),
            }
          : {}),
        ...(selectedChat.memberIds
          ? {
              memberIds: selectedChat.memberIds.filter(
                (memberId) => memberId !== userId,
              ),
            }
          : {}),
        updatedAt: new Date().toISOString(),
      };
      setChats((current) =>
        current.map((chat) => (chat.id === selectedChat.id ? updatedChat : chat)),
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to remove member.",
      );
    } finally {
      setRemovingGroupMemberIds((current) => {
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    }
  }

  async function handleUpdateSelectedGroupDetails(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const selectedChat = chats.find((chat) => chat.id === selectedChatId);
    const title = activeGroupTitleDraft.trim();

    if (!selectedChat || selectedChat.type !== "group") {
      return;
    }

    if (!title) {
      setError("Enter a group name.");
      return;
    }

    if (title === (selectedChat.title ?? "")) {
      return;
    }

    setIsUpdatingGroupDetails(true);
    setError(null);

    try {
      const updatedChat = await updateGroupChat(selectedChat.id, { title });
      setChats((current) =>
        current.map((chat) => (chat.id === updatedChat.id ? updatedChat : chat)),
      );
      setActiveGroupTitleDraft(updatedChat.title ?? "");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to update group.",
      );
    } finally {
      setIsUpdatingGroupDetails(false);
    }
  }

  async function handleUpdateSelectedGroupAvatar(file: File) {
    const selectedChat = chats.find((chat) => chat.id === selectedChatId);

    if (!selectedChat || selectedChat.type !== "group") {
      return;
    }

    setIsUpdatingGroupAvatar(true);
    setError(null);

    try {
      const avatar = await uploadGroupAvatar(file);
      const updatedChat = await updateGroupChat(selectedChat.id, {
        avatarUrl: avatar.url,
      });
      setChats((current) =>
        current.map((chat) => (chat.id === updatedChat.id ? updatedChat : chat)),
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to update avatar.",
      );
    } finally {
      setIsUpdatingGroupAvatar(false);
    }
  }

  async function handleUpdateMemberRole(
    userId: string,
    role: ChatMemberDto["role"],
  ) {
    const selectedChat = chats.find((chat) => chat.id === selectedChatId);

    if (!selectedChat || selectedChat.type !== "group") {
      return;
    }

    setUpdatingRoleMemberIds((current) => {
      const next = new Set(current);
      next.add(userId);
      return next;
    });
    setError(null);

    try {
      const updatedChat = await updateChatMemberRole(selectedChat.id, userId, role);
      setChats((current) =>
        current.map((chat) => (chat.id === updatedChat.id ? updatedChat : chat)),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to update role.");
    } finally {
      setUpdatingRoleMemberIds((current) => {
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    }
  }

  async function handleLeaveSelectedGroup() {
    const selectedChat = chats.find((chat) => chat.id === selectedChatId);

    if (!selectedChat || selectedChat.type !== "group" || !user) {
      return;
    }

    const confirmed = window.confirm(`Leave ${selectedChat.title ?? "this group"}?`);
    if (!confirmed) {
      return;
    }

    setIsLeavingGroup(true);
    setError(null);

    try {
      await leaveGroup(selectedChat.id, user.id);
      const nextChats = chats.filter((chat) => chat.id !== selectedChat.id);
      setChats(nextChats);
      setSelectedChatId(nextChats[0]?.id ?? null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to leave group.");
    } finally {
      setIsLeavingGroup(false);
    }
  }

  async function handleCreateSelectedGroupInvite() {
    if (!selectedChat || selectedChat.type !== "group") {
      return;
    }

    setIsUpdatingInvite(true);
    setError(null);

    try {
      const invite = await createChatInvite(selectedChat.id);
      setActiveGroupInvite(invite);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to create invite link.",
      );
    } finally {
      setIsUpdatingInvite(false);
    }
  }

  async function handleCopySelectedGroupInvite() {
    if (!activeGroupInviteUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activeGroupInviteUrl);
    } catch {
      setError("Could not copy invite link.");
    }
  }

  async function handleRevokeSelectedGroupInvite() {
    if (!selectedChat || selectedChat.type !== "group") {
      return;
    }

    setIsUpdatingInvite(true);
    setError(null);

    try {
      await revokeChatInvite(selectedChat.id);
      setActiveGroupInvite(null);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to revoke invite link.",
      );
    } finally {
      setIsUpdatingInvite(false);
    }
  }

  async function handleJoinByInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = parseInviteToken(inviteJoinInput);
    if (!token) {
      setError("Paste an invite link or token.");
      return;
    }

    setIsJoiningInvite(true);
    setError(null);

    try {
      const chat = await joinChatByInvite(token);
      setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
      setSelectedChatId(chat.id);
      setInviteJoinInput("");
      setCreatePanelOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to join group.");
    } finally {
      setIsJoiningInvite(false);
    }
  }

  async function runMessageSearch(query: string) {
    if (!selectedChatId) {
      return;
    }

    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      setMessageSearchError(trimmedQuery ? "Enter at least 2 characters." : null);
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

  async function handleMessageSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runMessageSearch(messageSearchQuery);
  }

  function clearMessageSearch() {
    setMessageSearchQuery("");
    setMessageSearchResults([]);
    setMessageSearchError(null);
    setHighlightedMessageId(null);
    setMessageSearchLoading(false);
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
    setMessageSearchQuery("");
    setMessageSearchResults([]);
    setMessageSearchError(null);
    setHighlightedMessageId(null);
    setActiveGroupMemberPhoneSearch("");
    const selectedChat = chats.find((chat) => chat.id === selectedChatId);
    setActiveGroupTitleDraft(
      selectedChat?.type === "group" ? (selectedChat.title ?? "") : "",
    );
  }, [chats, selectedChatId]);

  useEffect(() => {
    if (!selectedChat || !canManageSelectedGroupInvite) {
      setActiveGroupInvite(null);
      return;
    }

    let cancelled = false;
    setIsLoadingInvite(true);

    fetchActiveChatInvite(selectedChat.id)
      .then((invite) => {
        if (!cancelled) {
          setActiveGroupInvite(invite);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActiveGroupInvite(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingInvite(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canManageSelectedGroupInvite, selectedChat]);

  useEffect(() => {
    const trimmedQuery = messageSearchQuery.trim();

    setHighlightedMessageId(null);

    if (!selectedChatId || !trimmedQuery) {
      setMessageSearchResults([]);
      setMessageSearchError(null);
      setMessageSearchLoading(false);
      return;
    }

    if (trimmedQuery.length < 2) {
      setMessageSearchResults([]);
      setMessageSearchError("Enter at least 2 characters.");
      setMessageSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setMessageSearchLoading(true);
      setMessageSearchError(null);

      searchMessages(selectedChatId, trimmedQuery)
        .then((result) => {
          if (!cancelled) {
            setMessageSearchResults(result.messages);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setMessageSearchError(
              error instanceof Error
                ? error.message
                : "Failed to search messages.",
            );
            setMessageSearchResults([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setMessageSearchLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [messageSearchQuery, selectedChatId]);

  return (
    <ProtectedRoute>
      <main className="h-[100dvh] w-full overflow-hidden bg-[#0f1013] p-2 text-zinc-50 md:p-3">
        <div className="mx-auto flex h-full w-full max-w-[1500px] overflow-hidden border border-white/10 bg-[#111216] shadow-2xl shadow-black/40 rounded-2xl lg:flex-row">
        <aside className={`${selectedChatId ? "hidden lg:flex" : "flex"} min-h-0 w-full shrink-0 flex-col border-b border-white/10 bg-[#17191f] lg:w-[clamp(280px,26vw,380px)] lg:border-b-0 lg:border-r`}>
          <div className="shrink-0 space-y-3 border-b border-white/10 bg-[#17191f] p-4">
            <div className="flex items-center justify-between gap-3">
              <Link href="/profile" className="flex min-w-0 items-center gap-3 rounded-2xl p-1 transition hover:bg-white/[0.04]">
                <div className="relative">
                  <Avatar user={user ?? undefined} label={user?.displayName ?? "User"} size="lg" />
                  <span className="absolute bottom-0 right-0 rounded-full bg-[#17191f] p-1">
                    <PresenceDot online size="md" />
                  </span>
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-white">
                    {user?.displayName ?? "Your profile"}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-slate-400 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 0 1-15.4 6.4" />
                  <path d="M3 12A9 9 0 0 1 18.4 5.6" />
                  <path d="M18 2v4h4" />
                  <path d="M6 22v-4H2" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-[#20232b] px-3.5 py-2.5 text-slate-400 shadow-inner shadow-black/20 transition focus-within:border-emerald-400/50 focus-within:bg-[#242832]">
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  value={chatSearchQuery}
                  onChange={(event) => setChatSearchQuery(event.target.value)}
                  placeholder="Search conversations..."
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => setCreatePanelOpen((current) => !current)}
                  className="shrink-0 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-[#07110d] transition hover:bg-emerald-400"
                >
                  New
                </button>
              </div>

              {createPanelOpen ? (
                <div className="rounded-2xl border border-white/8 bg-[#20232b] p-3 shadow-inner shadow-black/20">
                  <div className="grid grid-cols-3 gap-2">
                    {(["direct", "group", "invite"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setCreatePanelTab(tab)}
                        className={`h-9 rounded-xl text-xs font-bold capitalize transition ${
                          createPanelTab === tab
                            ? "bg-emerald-500 text-[#07110d]"
                            : "bg-white/[0.06] text-slate-300 hover:bg-white/[0.1]"
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {createPanelTab === "direct" ? (
                    <form onSubmit={handleCreateDirectChat} className="mt-3 flex gap-2">
                      <label htmlFor="other-user-id" className="sr-only">
                        Start direct chat by phone
                      </label>
                      <input
                        id="other-user-id"
                        value={phoneSearch}
                        onChange={(event) => setPhoneSearch(event.target.value)}
                        placeholder="Phone number"
                        className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
                      />
                      <button
                        type="submit"
                        disabled={isCreating}
                        className="h-10 rounded-xl bg-emerald-500 px-4 text-xs font-bold text-[#07110d] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isCreating ? "..." : "Create"}
                      </button>
                    </form>
                  ) : null}

                  {createPanelTab === "invite" ? (
                    <form onSubmit={handleJoinByInvite} className="mt-3 flex gap-2">
                      <label htmlFor="invite-link" className="sr-only">
                        Join group by invite
                      </label>
                      <input
                        id="invite-link"
                        value={inviteJoinInput}
                        onChange={(event) => setInviteJoinInput(event.target.value)}
                        placeholder="Invite link or token"
                        className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
                      />
                      <button
                        type="submit"
                        disabled={isJoiningInvite}
                        className="h-10 rounded-xl bg-emerald-500 px-4 text-xs font-bold text-[#07110d] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isJoiningInvite ? "Joining" : "Join"}
                      </button>
                    </form>
                  ) : null}

                  {createPanelTab === "group" ? (
                    <div className="mt-3 space-y-3">
                      <form onSubmit={handleCreateGroupChat} className="space-y-3">
                        <label htmlFor="group-title" className="sr-only">
                          Group name
                        </label>
                        <input
                          id="group-title"
                          value={groupTitle}
                          onChange={(event) => setGroupTitle(event.target.value)}
                          placeholder="Group name"
                          className="h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
                        />

                        {groupMembers.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {groupMembers.map((member) => (
                              <button
                                key={member.id}
                                type="button"
                                onClick={() =>
                                  setGroupMembers((current) =>
                                    current.filter((item) => item.id !== member.id),
                                  )
                                }
                                className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-red-300/30 hover:bg-red-500/10 hover:text-red-100"
                                title="Remove member"
                              >
                                <span className="max-w-[180px] truncate">
                                  {member.displayName}
                                </span>
                                <span aria-hidden="true" className="text-slate-500">
                                  x
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}

                        <button
                          type="submit"
                          disabled={isCreatingGroup}
                          className="h-10 w-full rounded-xl bg-emerald-500 text-sm font-bold text-[#07110d] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isCreatingGroup ? "Creating..." : "Create group"}
                        </button>
                      </form>

                      <form onSubmit={handleAddGroupMember} className="flex gap-2">
                        <label htmlFor="group-member-phone" className="sr-only">
                          Member phone
                        </label>
                        <input
                          id="group-member-phone"
                          value={groupPhoneSearch}
                          onChange={(event) => setGroupPhoneSearch(event.target.value)}
                          placeholder="Add member phone"
                          className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
                        />
                        <button
                          type="submit"
                          disabled={isAddingGroupMember}
                          className="h-10 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isAddingGroupMember ? "..." : "Add"}
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex min-w-0 items-center gap-1.5 rounded-2xl bg-black/15 p-1 text-xs font-bold text-slate-400">
              {([
                ["all", "All"],
                ["group", "Groups"],
                ["direct", "Direct"],
              ] as const).map(([filter, label]) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setChatTypeFilter(filter)}
                  className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-2.5 py-2 transition ${
                    chatTypeFilter === filter
                      ? "bg-emerald-500/15 text-emerald-300 shadow-sm shadow-black/20"
                      : "hover:bg-white/[0.04] hover:text-slate-100"
                  }`}
                >
                  <span
                    className={
                      filter === "direct"
                        ? "h-4 w-4 rounded-full border border-current"
                        : filter === "group"
                          ? "text-lg leading-none"
                          : "h-4 w-4 rounded border border-current"
                    }
                  >
                    {filter === "group" ? "::" : ""}
                  </span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#15171c] px-2 py-2">
            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-2xl px-3 py-3"
                  >
                    <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.07]" />
                      <div className="h-3 w-4/5 animate-pulse rounded bg-white/[0.045]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="mx-2 mt-4 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-5 text-center">
                <p className="text-sm font-bold text-slate-200">
                  {chatSearchQuery.trim() ? "No conversations found" : "No chats yet"}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {chatSearchQuery.trim()
                    ? "Try a different name, number, or message preview."
                    : "Start a direct chat or create a group from New."}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredChats.map((chat) => {
                  const isSelected = chat.id === selectedChatId;
                  const otherMembers = getOtherMembers(chat, user?.id);
                  const otherUser = otherMembers[0]?.user;
                  const title = getChatTitle(chat, user?.id);
                  const subtitle = getChatSubtitle(chat, user?.id);
                  const preview =
                    chat.lastMessagePreview ?? subtitle;
                  const unreadCount = chat.unreadCount ?? 0;
                  const previewTime = chat.lastMessageAt ?? chat.updatedAt;
                  const previewTimeLabel = formatChatListTime(previewTime);
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
                      className={`group relative w-full rounded-2xl border px-3 py-3 text-left transition ${
                        isSelected
                          ? "border-emerald-400/30 bg-emerald-500/10 shadow-sm shadow-black/20"
                          : "border-transparent hover:border-white/10 hover:bg-white/[0.045]"
                      }`}
                    >
                      {isSelected ? (
                        <span className="absolute bottom-3 left-0 top-3 w-1 rounded-r-full bg-emerald-400" />
                      ) : null}
                      <div className="flex min-w-0 items-center gap-3 pl-1">
                        <div className="relative shrink-0">
                          <Avatar
                            user={chat.type === "group" ? undefined : otherUser}
                            label={title}
                            size="md"
                            imageUrl={
                              chat.type === "group" ? chat.avatarUrl : undefined
                            }
                          />
                          <span className="absolute bottom-0 right-0 rounded-full bg-[#17191f] p-1">
                            <PresenceDot online={hasOnlineMember} size="md" />
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className={`block truncate text-sm font-bold ${isSelected ? "text-emerald-300" : "text-white"}`}>
                              {title}
                            </span>
                            {chat.type === "group" ? (
                              <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                Group
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex min-w-0 items-center gap-1.5">
                            {isTypingInChat ? (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                            ) : null}
                            <span
                              className={`block truncate text-xs leading-5 ${
                                isTypingInChat
                                  ? "font-semibold text-emerald-300"
                                  : unreadCount > 0
                                    ? "font-semibold text-slate-200"
                                    : "text-slate-400"
                              }`}
                            >
                              {isTypingInChat ? "Typing..." : preview}
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2 self-stretch py-0.5">
                          <span
                            className={`text-[11px] ${
                              unreadCount > 0 ? "font-bold text-emerald-300" : "text-slate-500"
                            }`}
                          >
                            {previewTimeLabel}
                          </span>
                          {unreadCount > 0 ? (
                            <span className="min-w-5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-center text-[11px] font-black text-[#07110d] shadow-sm shadow-emerald-950/40">
                              {unreadCount > 9 ? "9+" : unreadCount}
                            </span>
                          ) : hasOnlineMember ? (
                            <span className="rounded-full border border-emerald-300/15 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                              Online
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <span className="mt-1 block truncate pl-[64px] text-[11px] text-slate-500">
                        {presenceStatus}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between border-t border-white/10 bg-[#17191f] px-4 py-3 text-sm text-slate-400">
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold text-slate-300">
              <PresenceDot online size="md" />
              Online
            </span>
            <Link href="/profile" className="rounded-full px-3 py-1.5 text-xs font-semibold transition hover:bg-white/[0.06] hover:text-white">
              Profile
            </Link>
          </div>
        </aside>

        <section className={`${selectedChatId ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-1 flex-col bg-[#111216]`}>
          {error ? <AppToast message={error} onDismiss={() => setError(null)} /> : null}

          {selectedChat && user ? (
            <ActiveChatPane
              chat={selectedChat}
              user={user}
              getPresence={getPresence}
              isOnline={isOnline}
              messageSearchQuery={messageSearchQuery}
              messageSearchResults={messageSearchResults}
              messageSearchLoading={messageSearchLoading}
              messageSearchError={messageSearchError}
              highlightedMessageId={highlightedMessageId}
              groupTitleDraft={activeGroupTitleDraft}
              groupMemberPhoneSearch={activeGroupMemberPhoneSearch}
              groupInvite={activeGroupInvite}
              groupInviteUrl={activeGroupInviteUrl}
              groupAvatarPending={isUpdatingGroupAvatar}
              groupDetailsPending={isUpdatingGroupDetails}
              groupMemberActionPending={isManagingGroupMember}
              leaveGroupPending={isLeavingGroup}
              groupInvitePending={isUpdatingInvite || isLoadingInvite}
              removingGroupMemberIds={removingGroupMemberIds}
              updatingRoleMemberIds={updatingRoleMemberIds}
              onMessageSearchChange={setMessageSearchQuery}
              onMessageSearch={handleMessageSearch}
              onClearMessageSearch={clearMessageSearch}
              onHighlightMessage={setHighlightedMessageId}
              onGroupTitleDraftChange={setActiveGroupTitleDraft}
              onGroupAvatarSelected={handleUpdateSelectedGroupAvatar}
              onSaveGroupDetails={handleUpdateSelectedGroupDetails}
              onCreateGroupInvite={handleCreateSelectedGroupInvite}
              onCopyGroupInvite={handleCopySelectedGroupInvite}
              onRevokeGroupInvite={handleRevokeSelectedGroupInvite}
              onGroupMemberPhoneSearchChange={setActiveGroupMemberPhoneSearch}
              onAddGroupMember={handleAddMemberToSelectedGroup}
              onRemoveGroupMember={handleRemoveMemberFromSelectedGroup}
              onUpdateGroupMemberRole={handleUpdateMemberRole}
              onLeaveGroup={handleLeaveSelectedGroup}
              onBackToChats={() => setSelectedChatId(null)}
            />
          ) : (
            <>
              <header className="shrink-0 border-b border-white/10 bg-[#15171c]/95 px-5 py-3">
                <h1 className="truncate text-lg font-bold text-white">
                  Select a conversation
                </h1>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  Create or choose a chat
                </p>
              </header>
              <div className="flex min-h-0 flex-1 items-center justify-center bg-[#101114] p-6">
                <div className="max-w-sm rounded-3xl border border-white/10 bg-white/[0.035] px-6 py-7 text-center shadow-2xl shadow-black/25">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-500/10 text-emerald-200">
                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                    </svg>
                  </div>
                  <h2 className="mt-4 text-lg font-bold text-white">Ready for chats</h2>

                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Create a direct chat from the sidebar using another signed-in
                    user&apos;s phone number.
                  </p>
                </div>
              </div>
            </>
          )}
        </section>
        </div>
      </main>
    </ProtectedRoute>
  );
}
