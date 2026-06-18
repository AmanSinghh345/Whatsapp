import type { MeResponseDto } from "@chat/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function fetchMe(idToken: string): Promise<MeResponseDto> {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
  }

  const response = await fetch(`${API_BASE_URL}/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${idToken}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch /me: ${response.status}`);
  }

  return (await response.json()) as MeResponseDto;
}
