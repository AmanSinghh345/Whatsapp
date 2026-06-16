import type { Id, ISODateString } from "../types/index.js";

export type MessageContentType = "text" | "attachment" | "system";

export type MessageReactionEmoji = "👍" | "❤️" | "😂" | "😮" | "😢";

export type MessageAttachmentDto = {
  id: Id;
  url: string;
  cloudinaryPublicId: string;
  resourceType: "image" | "video" | "raw";
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
};

export type MessageDto = {
  id: Id;
  chatId: Id;
  senderId: Id;
  replyToMessageId?: Id;
  replyTo?: MessageReplyPreviewDto;
  clientMessageId: string;
  contentType: MessageContentType;
  text?: string;
  attachments?: MessageAttachmentDto[];
  receiptStatus?: "sent" | "delivered" | "seen";
  receipts?: MessageReceiptDto[];
  reactions?: MessageReactionSummaryDto[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
  editedAt?: ISODateString;
  deletedAt?: ISODateString;
};

export type MessageReplyPreviewDto = {
  id: Id;
  senderId: Id;
  contentType: MessageContentType;
  text?: string;
  deletedAt?: ISODateString;
};

export type MessageReceiptDto = {
  recipientId: Id;
  deliveredAt?: ISODateString;
  seenAt?: ISODateString;
};

export type MessageReceiptUpdatedDto = MessageReceiptDto & {
  messageId: Id;
  chatId: Id;
  status: MessageReceiptStatus;
  updatedAt: ISODateString;
};

export type MessageReactionSummaryDto = {
  emoji: MessageReactionEmoji;
  count: number;
  userIds: Id[];
};

export type SendMessageRequestDto = {
  chatId: Id;
  clientMessageId: string;
  contentType: Exclude<MessageContentType, "system">;
  text?: string;
  attachmentIds?: Id[];
  replyToMessageId?: Id;
};

export type SearchMessagesRequestDto = {
  chatId: Id;
  q: string;
  cursor?: Id;
  limit?: number;
};

export type SearchMessagesResponseDto = {
  data: MessageDto[];
  nextCursor: Id | null;
};

export type MessageReceiptStatus = "delivered" | "seen";

export type UpsertReceiptDto = {
  messageId: Id;
  chatId: Id;
  status: MessageReceiptStatus;
  clientReceivedAt?: ISODateString;
};

export type ToggleMessageReactionRequestDto = {
  emoji: MessageReactionEmoji;
};

export type MessageReactionUpdatedDto = {
  chatId: Id;
  messageId: Id;
  reactions: MessageReactionSummaryDto[];
};

export type EditMessageRequestDto = {
  text: string;
};

export type MessageEditedDto = {
  chatId: Id;
  message: MessageDto;
};

export type MessageDeletedDto = {
  chatId: Id;
  message: MessageDto;
};
