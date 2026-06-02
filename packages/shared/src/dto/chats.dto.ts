import type { Id, ISODateString } from "../types/index.js";

export type ChatType = "direct" | "group";

export type ChatDto = {
  id: Id;
  type: ChatType;
  title?: string;
  avatarUrl?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type ChatMemberRole = "admin" | "member";

export type ChatMemberDto = {
  chatId: Id;
  userId: Id;
  role: ChatMemberRole;
  joinedAt: ISODateString;
};

export type CreateDirectChatRequestDto = {
  otherUserId: Id;
};

export type CreateGroupChatRequestDto = {
  title: string;
  memberUserIds: Id[];
};

