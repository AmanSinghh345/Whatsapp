const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

async function getAuthHeaders(): Promise<HeadersInit> {
  const { getAuth } = await import("firebase/auth");
  const auth = getAuth();
  const token = await auth.currentUser?.getIdToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type CloudinaryAssetResourceType = "image" | "video" | "raw";

export interface CloudinaryAssetDto {
  id: string;
  url: string;
  cloudinaryPublicId: string;
  resourceType: CloudinaryAssetResourceType;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
  createdAt: string;
}

interface UploadSignature {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
  resourceType: CloudinaryAssetResourceType;
}

function getResourceType(file: File): CloudinaryAssetResourceType {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "raw";
}

async function uploadMedia(
  file: File,
  folder = "chat-uploads",
): Promise<CloudinaryAssetDto> {
  const resourceType = getResourceType(file);
  const headers = await getAuthHeaders();

  const signatureRes = await fetch(`${API_BASE}/media/upload-signature`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      folder,
      resourceType,
    }),
  });

  if (!signatureRes.ok) {
    throw new Error(`Failed to create upload signature: ${signatureRes.status}`);
  }

  const signature = (await signatureRes.json()) as UploadSignature;
  const formData = new FormData();
  formData.set("file", file);
  formData.set("api_key", signature.apiKey);
  formData.set("timestamp", String(signature.timestamp));
  formData.set("signature", signature.signature);
  formData.set("folder", signature.folder);

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType}/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!uploadRes.ok) {
    throw new Error(`Failed to upload media: ${uploadRes.status}`);
  }

  const uploaded = await uploadRes.json();
  const confirmRes = await fetch(`${API_BASE}/media/confirm`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: uploaded.secure_url ?? uploaded.url,
      cloudinaryPublicId: uploaded.public_id,
      resourceType,
      mimeType: file.type || uploaded.resource_type,
      bytes: uploaded.bytes ?? file.size,
      width: uploaded.width,
      height: uploaded.height,
    }),
  });

  if (!confirmRes.ok) {
    throw new Error(`Failed to confirm media: ${confirmRes.status}`);
  }

  const body = await confirmRes.json();
  return body.data;
}

export async function uploadChatMedia(file: File): Promise<CloudinaryAssetDto> {
  return uploadMedia(file, "chat-uploads");
}

export async function uploadGroupAvatar(file: File): Promise<CloudinaryAssetDto> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Group avatar must be an image.");
  }

  return uploadMedia(file, "group-avatars");
}
