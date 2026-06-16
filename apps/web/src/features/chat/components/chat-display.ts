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

  const lastSeenLabel = formatLastSeenTime(lastSeenAt);

  return lastSeenLabel ? `Last seen ${lastSeenLabel}` : "Offline";
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
