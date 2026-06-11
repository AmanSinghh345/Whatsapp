import type { Id, ISODateString } from "../types/index.js";
import type { UserDto } from "./users.dto.js";

export type ChatType = "direct" | "group";

export type ChatDto = {
  id: Id;
  type: ChatType;
  title?: string;
  avatarUrl?: string;
  memberIds?: Id[];
  members?: ChatMemberDto[];
  lastMessagePreview?: string | null;
  lastMessageAt?: ISODateString | null;
  unreadCount?: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type ChatMemberRole = "admin" | "member";

export type ChatMemberDto = {
  chatId: Id;
  userId: Id;
  role: ChatMemberRole;
  joinedAt: ISODateString;
  user?: UserDto;
};

export type CreateDirectChatRequestDto = {
  otherUserId: Id;
};

export type CreateGroupChatRequestDto = {
  title: string;
  memberUserIds: Id[];
};
