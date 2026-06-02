import type { Id, ISODateString } from "../types/index.js";

export type UserDto = {
  id: Id;
  firebaseUid: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type UpdateMeRequestDto = {
  displayName?: string;
  avatarUrl?: string;
};

