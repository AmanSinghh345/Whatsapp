import type { Id, ISODateString } from "../types/index.js";

export type UserDto = {
  id: Id;
  firebaseUid: string;
  email?: string;
  phoneE164?: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type UpdateMeRequestDto = {
  displayName?: string;
  phoneE164?: string | null;
  avatarUrl?: string;
};
