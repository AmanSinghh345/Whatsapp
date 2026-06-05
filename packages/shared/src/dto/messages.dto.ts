import type { Id, ISODateString } from "../types/index.js";

export type MessageContentType = "text" | "attachment" | "system";

export type MessageAttachmentDto = {
  id: Id;
  url: string;
  cloudinaryPublicId: string;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
};

export type MessageDto = {
  id: Id;
  chatId: Id;
  senderId: Id;
  clientMessageId: string;
  contentType: MessageContentType;
  text?: string;
  attachments?: MessageAttachmentDto[];
  receiptStatus?: "sent" | "delivered" | "seen";
  receipts?: MessageReceiptDto[];
  createdAt: ISODateString;
};

export type MessageReceiptDto = {
  recipientId: Id;
  deliveredAt?: ISODateString;
  seenAt?: ISODateString;
};

export type SendMessageRequestDto = {
  chatId: Id;
  clientMessageId: string;
  contentType: Exclude<MessageContentType, "system">;
  text?: string;
  attachmentIds?: Id[];
};

export type MessageReceiptStatus = "delivered" | "seen";

export type UpsertReceiptDto = {
  messageId: Id;
  chatId: Id;
  status: MessageReceiptStatus;
  clientReceivedAt?: ISODateString;
};
