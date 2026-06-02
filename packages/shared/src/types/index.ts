export type Id = string;

export type CursorPageRequest = {
  limit: number;
  cursor?: string;
};

export type CursorPageResponse<T> = {
  items: T[];
  nextCursor?: string;
};

export type ISODateString = string;

