// apps/web/src/features/chat/api/messages.api.ts

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

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
export interface MessageDto {
  id: string;
  chatId: string;
  senderId: string;
  clientMessageId: string;
  contentType: "text" | "attachment";
  text: string | null;
  createdAt: string;
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

export async function sendMessage(
  chatId: string,
  text: string
): Promise<MessageDto> {
  const headers = await getAuthHeaders();

  const payload = {
    chatId,
    contentType: "text",
    text,
    // Idempotency key: unique per send attempt
    clientMessageId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };

  const res = await fetch(`${API_BASE}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to send message: ${res.status}`);

  const body = await res.json();
  // Backend returns { data: MessageDto }
  return body.data;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/messages/${messageId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`Failed to delete message: ${res.status}`);
}