"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ChatDto, ChatMemberDto, UserDto } from "@chat/shared";
import { ProtectedRoute } from "../features/auth/components/protected-route";
import { useAuthStore } from "../features/auth/store/auth.store";
import {
  addGroupMembers,
  createDirectChat,
  createGroupChat,
  fetchChats,
  leaveGroup,
  removeGroupMember,
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
  imageUrl,
}: {
  user?: UserDto | undefined;
  label: string;
  size?: "sm" | "md" | "lg";
  imageUrl?: string | undefined;
}) {
  const sizeClass =
    size === "lg" ? "h-14 w-14 text-lg" : size === "sm" ? "h-11 w-11" : "h-12 w-12";
  const avatarUrl = imageUrl ?? user?.avatarUrl;

  return (
    <div
      className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-emerald-500 to-slate-700 text-sm font-semibold text-white ring-1 ring-white/10`}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
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
  groupAvatarPending,
  groupDetailsPending,
  groupMemberActionPending,
  leaveGroupPending,
  removingGroupMemberIds,
  updatingRoleMemberIds,
  onMessageSearchChange,
  onMessageSearch,
  onHighlightMessage,
  onGroupTitleDraftChange,
  onGroupAvatarSelected,
  onSaveGroupDetails,
  onGroupMemberPhoneSearchChange,
  onAddGroupMember,
  onRemoveGroupMember,
  onUpdateGroupMemberRole,
  onLeaveGroup,
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
  groupAvatarPending: boolean;
  groupDetailsPending: boolean;
  groupMemberActionPending: boolean;
  leaveGroupPending: boolean;
  removingGroupMemberIds: Set<string>;
  updatingRoleMemberIds: Set<string>;
  onMessageSearchChange: (value: string) => void;
  onMessageSearch: (event: FormEvent<HTMLFormElement>) => void;
  onHighlightMessage: (messageId: string) => void;
  onGroupTitleDraftChange: (value: string) => void;
  onGroupAvatarSelected: (file: File) => void;
  onSaveGroupDetails: (event: FormEvent<HTMLFormElement>) => void;
  onGroupMemberPhoneSearchChange: (value: string) => void;
  onAddGroupMember: (event: FormEvent<HTMLFormElement>) => void;
  onRemoveGroupMember: (userId: string) => void;
  onUpdateGroupMemberRole: (
    userId: string,
    role: ChatMemberDto["role"],
  ) => void;
  onLeaveGroup: () => void;
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

  return (
    <>
      <header className="border-b border-white/10 bg-[#15171c] px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-4">
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
              <h1 className="truncate text-xl font-bold text-white">{title}</h1>
              <p className="mt-1 flex items-center gap-2 truncate text-sm text-slate-400">
                {hasOnlineMember ? (
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                ) : null}
                {presenceStatus}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2 xl:w-[480px]">
            <form
              onSubmit={onMessageSearch}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <input
                value={messageSearchQuery}
                onChange={(event) => onMessageSearchChange(event.target.value)}
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
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </button>
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
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/15 text-emerald-300 transition hover:bg-emerald-500/25 hover:text-emerald-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-slate-500"
            >
              <VideoCallIcon />
            </button>
          </div>

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
                    onClick={() => onHighlightMessage(message.id)}
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
      </header>

      {chat.type === "group" ? (
        <section className="border-b border-white/10 bg-[#15171c] px-5 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
                Members
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
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
                  const nextRole = member.role === "admin" ? "member" : "admin";
                  const canChangeRole = canManageGroup && !isCurrentUser;

                  return (
                    <div
                      key={member.userId}
                      className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-slate-200"
                    >
                      <span className="max-w-[180px] truncate font-semibold">
                        {memberName}
                      </span>
                      <span className="text-slate-500">{member.role}</span>
                      {canChangeRole ? (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateGroupMemberRole(member.userId, nextRole)
                          }
                          disabled={updatingRoleMemberIds.has(member.userId)}
                          className="ml-1 rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-bold text-slate-300 transition hover:border-emerald-300/30 hover:bg-emerald-500/15 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={
                            nextRole === "admin"
                              ? `Promote ${memberName}`
                              : `Demote ${memberName}`
                          }
                        >
                          {nextRole === "admin" ? "Promote" : "Demote"}
                        </button>
                      ) : null}
                      {canRemove ? (
                        <button
                          type="button"
                          onClick={() => onRemoveGroupMember(member.userId)}
                          disabled={removingGroupMemberIds.has(member.userId)}
                          className="ml-1 rounded-full px-1.5 text-slate-500 transition hover:bg-red-500/15 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Remove ${memberName}`}
                          title={`Remove ${memberName}`}
                        >
                          x
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid min-w-0 gap-2 xl:w-[360px]">
                <button
                  type="button"
                  onClick={onLeaveGroup}
                  disabled={leaveGroupPending}
                  className="h-10 w-full rounded-xl border border-red-300/20 bg-red-500/10 text-sm font-bold text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {leaveGroupPending ? "Leaving" : "Leave group"}
                </button>

              {canManageGroup ? (
                <>
                <label className="flex h-10 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-sm font-bold text-slate-100 transition hover:bg-white/[0.1]">
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
                  <label htmlFor="group-title-draft" className="sr-only">
                    Group name
                  </label>
                  <input
                    id="group-title-draft"
                    value={groupTitleDraft}
                    onChange={(event) =>
                      onGroupTitleDraftChange(event.target.value)
                    }
                    placeholder="Group name"
                    className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#20232b] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
                  />
                  <button
                    type="submit"
                    disabled={groupDetailsPending}
                    className="h-10 shrink-0 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-bold text-slate-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {groupDetailsPending ? "Saving" : "Save"}
                  </button>
                </form>

                <form
                  onSubmit={onAddGroupMember}
                  className="flex min-w-0 gap-2"
                >
                  <label htmlFor="active-group-member-phone" className="sr-only">
                    Add group member by phone
                  </label>
                  <input
                    id="active-group-member-phone"
                    value={groupMemberPhoneSearch}
                    onChange={(event) =>
                      onGroupMemberPhoneSearchChange(event.target.value)
                    }
                    placeholder="Add member phone"
                    className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#20232b] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
                  />
                  <button
                    type="submit"
                    disabled={groupMemberActionPending}
                    className="h-10 shrink-0 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-[#07110d] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                  {groupMemberActionPending ? "Adding" : "Add"}
                </button>
              </form>
                </>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <CallPanel
        phase={call.phase}
        peerName={activeCallPeerName}
        localStream={call.localStream}
        remoteStream={call.remoteStream}
        error={call.error}
        isMicMuted={call.isMicMuted}
        isCameraOff={call.isCameraOff}
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
    </>
  );
}

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const joinedChatIdsRef = useRef<Set<string>>(new Set());

  const [chats, setChats] = useState<ChatDto[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupPhoneSearch, setGroupPhoneSearch] = useState("");
  const [groupMembers, setGroupMembers] = useState<UserDto[]>([]);
  const [activeGroupMemberPhoneSearch, setActiveGroupMemberPhoneSearch] =
    useState("");
  const [activeGroupTitleDraft, setActiveGroupTitleDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isAddingGroupMember, setIsAddingGroupMember] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isManagingGroupMember, setIsManagingGroupMember] = useState(false);
  const [isUpdatingGroupDetails, setIsUpdatingGroupDetails] = useState(false);
  const [isUpdatingGroupAvatar, setIsUpdatingGroupAvatar] = useState(false);
  const [isLeavingGroup, setIsLeavingGroup] = useState(false);
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

            <div className="rounded-2xl border border-white/8 bg-[#20232b] p-3 shadow-inner shadow-black/20">
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

              <form onSubmit={handleAddGroupMember} className="mt-3 flex gap-2">
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
                  const preview =
                    chat.lastMessagePreview ?? subtitle;
                  const unreadCount = chat.unreadCount ?? 0;
                  const previewTime = chat.lastMessageAt ?? chat.updatedAt;
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
                          <span className={`block truncate text-base font-bold ${isSelected ? "text-emerald-400" : "text-white"}`}>
                            {title}
                          </span>
                          <span
                            className={`mt-1 block truncate text-sm ${
                              isTypingInChat ? "font-semibold text-emerald-400" : "text-slate-400"
                            }`}
                          >
                            {isTypingInChat ? "Typing..." : preview}
                          </span>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span className="text-xs text-slate-400">
                            {new Date(previewTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {unreadCount > 0 ? (
                            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-[#07110d]">
                              {unreadCount > 9 ? "9+" : unreadCount}
                            </span>
                          ) : hasOnlineMember ? (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
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
          {error && (
            <div className="mx-5 mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

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
              groupAvatarPending={isUpdatingGroupAvatar}
              groupDetailsPending={isUpdatingGroupDetails}
              groupMemberActionPending={isManagingGroupMember}
              leaveGroupPending={isLeavingGroup}
              removingGroupMemberIds={removingGroupMemberIds}
              updatingRoleMemberIds={updatingRoleMemberIds}
              onMessageSearchChange={setMessageSearchQuery}
              onMessageSearch={handleMessageSearch}
              onHighlightMessage={setHighlightedMessageId}
              onGroupTitleDraftChange={setActiveGroupTitleDraft}
              onGroupAvatarSelected={handleUpdateSelectedGroupAvatar}
              onSaveGroupDetails={handleUpdateSelectedGroupDetails}
              onGroupMemberPhoneSearchChange={setActiveGroupMemberPhoneSearch}
              onAddGroupMember={handleAddMemberToSelectedGroup}
              onRemoveGroupMember={handleRemoveMemberFromSelectedGroup}
              onUpdateGroupMemberRole={handleUpdateMemberRole}
              onLeaveGroup={handleLeaveSelectedGroup}
            />
          ) : (
            <>
              <header className="border-b border-white/10 bg-[#15171c] px-5 py-4">
                <h1 className="truncate text-xl font-bold">
                  Select a conversation
                </h1>
                <p className="mt-1 truncate text-sm text-slate-400">
                  Create or choose a chat
                </p>
              </header>
              <div className="flex flex-1 items-center justify-center p-6">
                <div className="max-w-md text-center">
                  <h2 className="text-xl font-bold">Ready for chats</h2>

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
