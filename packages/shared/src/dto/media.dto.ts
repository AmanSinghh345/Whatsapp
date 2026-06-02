import type { Id, ISODateString } from "../types/index.js";

export type CloudinaryAssetResourceType = "image" | "video" | "raw";

export type CloudinaryAssetDto = {
  id: Id;
  url: string;
  cloudinaryPublicId: string;
  resourceType: CloudinaryAssetResourceType;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
  createdAt: ISODateString;
};

export type CreateUploadSignatureRequestDto = {
  folder: string;
  resourceType: CloudinaryAssetResourceType;
};

export type CreateUploadSignatureResponseDto = {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
  resourceType: CloudinaryAssetResourceType;
};

export type ConfirmUploadRequestDto = {
  url: string;
  cloudinaryPublicId: string;
  resourceType: CloudinaryAssetResourceType;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
};

