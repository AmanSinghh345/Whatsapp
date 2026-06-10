import type { ChatDto, ChatMemberDto, UserDto } from "@chat/shared";

export type PresenceView = {
  state: "online" | "offline";
  lastSeenAt?: string;
};

export type ChatPreviewFields = {
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number | null;
};

export type DisplayChat = ChatDto & ChatPreviewFields;

export function getOtherMembers(
  chat: ChatDto,
  currentUserId?: string,
): ChatMemberDto[] {
  return (chat.members ?? []).filter((member) => member.userId !== currentUserId);
}

export function getOtherMemberIds(chat: ChatDto, currentUserId?: string) {
  return getOtherMembers(chat, currentUserId).map((member) => member.userId);
}

export function getChatTitle(chat: ChatDto, currentUserId?: string) {
  if (chat.type === "group") {
    return chat.title ?? "Group chat";
  }

  return getOtherMembers(chat, currentUserId)[0]?.user?.displayName ?? "Direct chat";
}

export function getChatSubtitle(chat: ChatDto, currentUserId?: string) {
  if (chat.type === "group") {
    return `${chat.members?.length ?? 0} members`;
  }

  const otherUser = getOtherMembers(chat, currentUserId)[0]?.user;
  return otherUser?.phoneE164 ?? otherUser?.email ?? "Direct message";
}

export function getChatAvatarUser(chat: ChatDto, currentUserId?: string) {
  return getOtherMembers(chat, currentUserId)[0]?.user;
}

export function getInitials(label: string) {
  return label
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function getUserLabel(user?: UserDto, fallback = "U") {
  return user?.displayName ?? user?.email ?? user?.phoneE164 ?? fallback;
}

export function formatPresenceStatus(
  presence?: PresenceView,
  fallbackLastSeenAt?: string,
) {
  if (presence?.state === "online") {
    return "Online now";
  }

  const lastSeenAt = presence?.lastSeenAt ?? fallbackLastSeenAt;

  if (!lastSeenAt) {
    return "Offline";
  }

  const lastSeenTime = new Date(lastSeenAt).getTime();

  if (Number.isNaN(lastSeenTime)) {
    return "Offline";
  }

  const minutesAgo = Math.max(1, Math.floor((Date.now() - lastSeenTime) / 60_000));

  if (minutesAgo < 60) {
    return `Last seen ${minutesAgo}m ago`;
  }

  const hoursAgo = Math.floor(minutesAgo / 60);
  return `Last seen ${hoursAgo}h ago`;
}

export function getChatPresenceStatus(
  members: ChatMemberDto[],
  getPresence: (userId: string) => PresenceView | undefined,
) {
  const onlineMember = members.find(
    (member) => getPresence(member.userId)?.state === "online",
  );

  if (onlineMember) {
    return "Online now";
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

export function formatChatTime(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
