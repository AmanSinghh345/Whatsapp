import type {
  ChatDto,
  ChatInviteDto,
  ChatMemberRole,
  CreateDirectChatRequestDto,
  CreateGroupChatRequestDto,
  UpdateGroupChatRequestDto,
} from "@chat/shared";
import { getFirebaseAuth } from "../../auth/lib/firebase-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

type ChatsResponse = {
  data: ChatDto[];
  nextCursor: string | null;
};

type ChatResponse = {
  data: ChatDto;
};

type ChatInviteResponse = {
  data: ChatInviteDto | null;
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

export async function createGroupChat(
  request: CreateGroupChatRequestDto,
): Promise<ChatDto> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/chats`, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to create group: ${response.status}`);
  }

  const result = (await response.json()) as ChatResponse;
  return result.data;
}

export async function addGroupMembers(
  chatId: string,
  memberUserIds: string[],
): Promise<ChatDto> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/chats/${chatId}/members`, {
    method: "POST",
    headers,
    body: JSON.stringify({ memberUserIds }),
  });

  if (!response.ok) {
    throw new Error(`Failed to add group member: ${response.status}`);
  }

  const result = (await response.json()) as ChatResponse;
  return result.data;
}

export async function removeGroupMember(
  chatId: string,
  userId: string,
): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/chats/${chatId}/members/${userId}`, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to remove group member: ${response.status}`);
  }
}

export async function leaveGroup(
  chatId: string,
  currentUserId: string,
): Promise<void> {
  await removeGroupMember(chatId, currentUserId);
}

export async function updateGroupChat(
  chatId: string,
  request: UpdateGroupChatRequestDto,
): Promise<ChatDto> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/chats/${chatId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to update group: ${response.status}`);
  }

  const result = (await response.json()) as ChatResponse;
  return result.data;
}

export async function updateChatMemberRole(
  chatId: string,
  userId: string,
  role: ChatMemberRole,
): Promise<ChatDto> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/chats/${chatId}/members/${userId}/role`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ role }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update member role: ${response.status}`);
  }

  const result = (await response.json()) as ChatResponse;
  return result.data;
}

export async function fetchActiveChatInvite(
  chatId: string,
): Promise<ChatInviteDto | null> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/chats/${chatId}/invite`, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load invite link: ${response.status}`);
  }

  const result = (await response.json()) as ChatInviteResponse;
  return result.data;
}

export async function createChatInvite(chatId: string): Promise<ChatInviteDto> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/chats/${chatId}/invite`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to create invite link: ${response.status}`);
  }

  const result = (await response.json()) as { data: ChatInviteDto };
  return result.data;
}

export async function revokeChatInvite(chatId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/chats/${chatId}/invite`, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to revoke invite link: ${response.status}`);
  }
}

export async function joinChatByInvite(token: string): Promise<ChatDto> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/chats/invites/${token}/join`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to join group: ${response.status}`);
  }

  const result = (await response.json()) as ChatResponse;
  return result.data;
}
