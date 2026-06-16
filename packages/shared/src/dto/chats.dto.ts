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

export type UpdateGroupChatRequestDto = {
  title?: string;
  avatarUrl?: string | null;
};

export type UpdateChatMemberRoleRequestDto = {
  role: ChatMemberRole;
};

export type ChatInviteDto = {
  id: Id;
  chatId: Id;
  token: string;
  inviteUrl?: string;
  createdById: Id;
  revokedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type CreateChatInviteResponseDto = {
  invite: ChatInviteDto;
};

export type JoinChatByInviteResponseDto = {
  chat: ChatDto;
};
