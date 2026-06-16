import type { UpdateMeRequestDto, UserDto } from "@chat/shared";
import { getFirebaseAuth } from "../../auth/lib/firebase-client";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

type UserResponse = {
  data: UserDto;
};

async function getAuthHeaders(): Promise<HeadersInit> {
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

async function getErrorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    const message = body.message;

    if (Array.isArray(message)) {
      return message.join(" ");
    }

    return message || fallback;
  } catch {
    return fallback;
  }
}

export async function updateMe(request: UpdateMeRequestDto): Promise<UserDto> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/users/me`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, `Failed to update profile: ${response.status}`),
    );
  }

  const result = (await response.json()) as UserResponse;
  return result.data;
}

export async function searchUserByPhone(phone: string): Promise<UserDto> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({ phone });
  const response = await fetch(`${API_BASE_URL}/users/search?${params}`, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        `No user found for that phone number: ${response.status}`,
      ),
    );
  }

  const result = (await response.json()) as UserResponse;
  return result.data;
}
