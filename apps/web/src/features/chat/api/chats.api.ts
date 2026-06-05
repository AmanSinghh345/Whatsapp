import type { ChatDto, CreateDirectChatRequestDto } from "@chat/shared";
import { getFirebaseAuth } from "../../auth/lib/firebase-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

type ChatsResponse = {
  data: ChatDto[];
  nextCursor: string | null;
};

type ChatResponse = {
  data: ChatDto;
};

async function getAuthHeaders(): Promise<HeadersInit> {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
  }

  const auth = getFirebaseAuth();
  const idToken = await auth.currentUser?.getIdToken();

  if (!idToken) {
    throw new Error("You need to sign in again.");
  }

  return {
    Authorization: `Bearer ${idToken}`,
    "Content-Type": "application/json",
  };
}

export async function fetchChats(): Promise<ChatsResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/chats`, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load chats: ${response.status}`);
  }

  return (await response.json()) as ChatsResponse;
}

export async function createDirectChat(
  request: CreateDirectChatRequestDto,
): Promise<ChatDto> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/chats`, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to create chat: ${response.status}`);
  }

  const result = (await response.json()) as ChatResponse;
  return result.data;
}
