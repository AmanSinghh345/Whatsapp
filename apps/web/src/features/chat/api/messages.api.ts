// apps/web/src/features/chat/api/messages.api.ts

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
    public readonly durationMs: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const { getAuth } = await import("firebase/auth");
  const auth = getAuth();
  const token = await auth.currentUser?.getIdToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Matches your backend MessageDto exactly
export type RpsChoice = "rock" | "paper" | "scissors";
export type TicTacToeCell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface RpsGameData {
  kind: "rps";
  status: "waiting" | "finished";
  createdByUserId: string;
  choices: Record<
    string,
    {
      choice: RpsChoice;
      chosenAt: string;
    }
  >;
  result?: {
    status: "waiting" | "tie" | "winner";
    winnerUserId?: string;
    reason?: string;
  };
}

export interface TicTacToeGameData {
  kind: "tic-tac-toe";
  status: "waiting" | "playing" | "finished";
  createdByUserId: string;
  players: {
    x?: string;
    o?: string;
  };
  board: Array<"x" | "o" | null>;
  nextTurn: "x" | "o";
  moves: Array<{
    userId: string;
    mark: "x" | "o";
    cell: TicTacToeCell;
    playedAt: string;
  }>;
  result?: {
    status: "waiting" | "tie" | "winner";
    winnerUserId?: string;
    winningCells?: TicTacToeCell[];
    reason?: string;
  };
}

export type GameMessageData = RpsGameData | TicTacToeGameData;

export interface MessageDto {
  id: string;
  chatId: string;
  senderId: string;
  replyToMessageId?: string;
  replyTo?: MessageReplyPreviewDto;
  clientMessageId: string;
  contentType: "text" | "attachment" | "system" | "game";
  text?: string | null;
  gameData?: GameMessageData;
  attachments?: {
    id: string;
    url: string;
    cloudinaryPublicId: string;
    resourceType: "image" | "video" | "raw";
    mimeType: string;
    bytes: number;
    width?: number;
    height?: number;
  }[];
  receiptStatus?: "sending" | "failed" | "sent" | "delivered" | "seen";
  receipts?: MessageReceiptDto[];
  reactions?: MessageReactionSummaryDto[];
  createdAt: string;
  updatedAt: string;
  editedAt?: string;
  deletedAt?: string;
}

export interface MessageReceiptDto {
  recipientId: string;
  deliveredAt?: string;
  seenAt?: string;
}

export interface MessageReceiptUpdatedDto extends MessageReceiptDto {
  messageId: string;
  chatId: string;
  status: "delivered" | "seen";
  updatedAt: string;
}

export interface MessageReplyPreviewDto {
  id: string;
  senderId: string;
  contentType: "text" | "attachment" | "system" | "game";
  text?: string | null;
  deletedAt?: string;
}

export type MessageReactionEmoji =
  | "👍"
  | "❤️"
  | "😂"
  | "😮"
  | "😢"
  | "🙏"
  | "🔥"
  | "👏"
  | "🎉"
  | "💯"
  | "😎"
  | "😭"
  | "🤔"
  | "👀";

export interface MessageReactionSummaryDto {
  emoji: MessageReactionEmoji;
  count: number;
  userIds: string[];
}

export interface MessageReactionUpdatedDto {
  chatId: string;
  messageId: string;
  reactions: MessageReactionSummaryDto[];
}

export interface MessageEditedDto {
  chatId: string;
  message: MessageDto;
}

export interface MessageDeletedDto {
  chatId: string;
  message: MessageDto;
}

export async function fetchMessages(
  chatId: string,
  cursor?: string,
  limit = 50
): Promise<{ messages: MessageDto[]; nextCursor: string | null }> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({ chatId, limit: String(limit) });
  if (cursor) params.set("cursor", cursor);

  const res = await fetch(`${API_BASE}/messages?${params}`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`);

  const body = await res.json();
  // Backend returns { data: MessageDto[], nextCursor: string | null }
  return { messages: body.data, nextCursor: body.nextCursor };
}

export async function searchMessages(
  chatId: string,
  query: string,
  cursor?: string,
  limit = 20
): Promise<{ messages: MessageDto[]; nextCursor: string | null }> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({
    chatId,
    q: query,
    limit: String(limit),
  });
  if (cursor) params.set("cursor", cursor);

  const res = await fetch(`${API_BASE}/messages/search?${params}`, {
    headers,
  });
  if (!res.ok) throw new Error(`Failed to search messages: ${res.status}`);

  const body = await res.json();
  return { messages: body.data, nextCursor: body.nextCursor };
}

export async function sendMessage(
  chatId: string,
  text: string,
  replyToMessageId?: string,
  clientMessageId = `${Date.now()}-${Math.random().toString(36).slice(2)}`,
): Promise<MessageDto> {
  const headers = await getAuthHeaders();
  const endpoint = "/messages";
  const startedAt = Date.now();

  const payload = {
    chatId,
    contentType: "text",
    text,
    ...(replyToMessageId ? { replyToMessageId } : {}),
    // Idempotency key: unique per send attempt
    clientMessageId,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new ApiRequestError(
      `Failed to send message: ${res.status}`,
      res.status,
      endpoint,
      Date.now() - startedAt,
    );
  }

  const body = await res.json();
  // Backend returns { data: MessageDto }
  return body.data;
}

export async function sendAttachmentMessage(
  chatId: string,
  attachmentIds: string[],
  text?: string,
  replyToMessageId?: string,
): Promise<MessageDto> {
  const headers = await getAuthHeaders();

  const payload = {
    chatId,
    contentType: "attachment",
    attachmentIds,
    ...(text?.trim() ? { text: text.trim() } : {}),
    ...(replyToMessageId ? { replyToMessageId } : {}),
    clientMessageId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };

  const res = await fetch(`${API_BASE}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to send attachment: ${res.status}`);

  const body = await res.json();
  return body.data;
}

export async function deleteMessage(messageId: string): Promise<MessageDto> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/messages/${messageId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`Failed to delete message: ${res.status}`);

  const body = await res.json();
  return body.data;
}

export async function editMessage(
  messageId: string,
  text: string,
): Promise<MessageDto> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/messages/${messageId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error(`Failed to edit message: ${res.status}`);
  }

  const body = await res.json();
  return body.data;
}

export async function upsertMessageReceipt(
  chatId: string,
  messageId: string,
  status: "delivered" | "seen"
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/messages/receipt/upsert`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      chatId,
      messageId,
      status,
      clientReceivedAt: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to update message receipt: ${res.status}`);
  }
}

export async function toggleMessageReaction(
  messageId: string,
  emoji: MessageReactionEmoji,
): Promise<MessageReactionUpdatedDto> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/messages/${messageId}/reactions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ emoji }),
  });

  if (!res.ok) {
    throw new Error(`Failed to update reaction: ${res.status}`);
  }

  const body = await res.json();
  return body.data;
}

export async function playGameAction(
  messageId: string,
  action:
    | { action: "choose"; choice: RpsChoice }
    | { action: "place"; cell: TicTacToeCell },
): Promise<MessageDto> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/messages/${messageId}/game-actions`, {
    method: "POST",
    headers,
    body: JSON.stringify(action),
  });

  if (!res.ok) {
    throw new Error(`Failed to play game action: ${res.status}`);
  }

  const body = await res.json();
  return body.data;
}
