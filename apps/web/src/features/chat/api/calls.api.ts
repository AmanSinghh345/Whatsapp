import type {
  CallSessionDto,
  ChatDto,
  CreateCallRequestDto,
} from "@chat/shared";
import { getFirebaseAuth } from "../../auth/lib/firebase-client";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await getFirebaseAuth().currentUser?.getIdToken();

  if (!token) {
    throw new Error("You need to sign in again.");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function createCall(
  request: CreateCallRequestDto,
): Promise<{ call: CallSessionDto; chat: ChatDto }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/calls`, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to start call: ${response.status}`);
  }

  const body = await response.json();
  return body.data;
}

export async function answerCall(callId: string): Promise<CallSessionDto> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/calls/${callId}/answer`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to answer call: ${response.status}`);
  }

  const body = await response.json();
  return body.data;
}

export async function endCall(callId: string): Promise<CallSessionDto> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/calls/${callId}/end`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to end call: ${response.status}`);
  }

  const body = await response.json();
  return body.data;
}
