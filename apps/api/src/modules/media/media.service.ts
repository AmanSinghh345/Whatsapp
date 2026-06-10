import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service.js";
import type {
  CloudinaryAssetDto,
  ConfirmUploadRequestDto,
  CreateUploadSignatureRequestDto,
  CreateUploadSignatureResponseDto,
} from "@chat/shared";

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  createUploadSignature(
    request: CreateUploadSignatureRequestDto,
  ): CreateUploadSignatureResponseDto {
    const apiKey = this.requiredEnv("CLOUDINARY_API_KEY");
    const apiSecret = this.requiredEnv("CLOUDINARY_API_SECRET");
    const cloudName = this.requiredEnv("CLOUDINARY_CLOUD_NAME");
    const folder = this.normalizeFolder(request.folder);
    const resourceType = request.resourceType;
    const timestamp = Math.floor(Date.now() / 1000);
    const params = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = createHash("sha1").update(params).digest("hex");

    return {
      timestamp,
      signature,
      apiKey,
      cloudName,
      folder,
      resourceType,
    };
  }

  async confirmUpload(
    request: ConfirmUploadRequestDto,
  ): Promise<CloudinaryAssetDto> {
    if (!request.url || !request.cloudinaryPublicId || !request.mimeType) {
      throw new BadRequestException("Upload metadata is incomplete");
    }

    if (!Number.isFinite(request.bytes) || request.bytes <= 0) {
      throw new BadRequestException("Upload size must be greater than zero");
    }

    const attachment = await this.prisma.messageAttachment.create({
      data: {
        url: request.url,
        cloudinaryPublicId: request.cloudinaryPublicId,
        resourceType: request.resourceType,
        mimeType: request.mimeType,
        bytes: Math.round(request.bytes),
        ...(request.width ? { width: request.width } : {}),
        ...(request.height ? { height: request.height } : {}),
      },
    });

    return this.toAssetDto(attachment);
  }

  async getAsset(assetId: string): Promise<CloudinaryAssetDto> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: assetId },
    });

    if (!attachment) {
      throw new NotFoundException(`Media asset ${assetId} not found`);
    }

    return this.toAssetDto(attachment);
  }

  private requiredEnv(name: string): string {
    const value = this.configService.get<string>(name);

    if (!value) {
      throw new BadRequestException(`${name} is not configured`);
    }

    return value;
  }

  private normalizeFolder(folder: string): string {
    const normalized = folder.trim().replace(/\\/g, "/");

    if (!/^[a-zA-Z0-9/_-]+$/.test(normalized)) {
      throw new BadRequestException("Folder can only contain letters, numbers, slash, underscore, or dash");
    }

    return normalized.replace(/^\/+|\/+$/g, "") || "chat-uploads";
  }

  private toAssetDto(attachment: {
    id: string;
    url: string;
    cloudinaryPublicId: string;
    resourceType: string;
    mimeType: string;
    bytes: number;
    width: number | null;
    height: number | null;
    createdAt: Date;
  }): CloudinaryAssetDto {
    return {
      id: attachment.id,
      url: attachment.url,
      cloudinaryPublicId: attachment.cloudinaryPublicId,
      resourceType:
        attachment.resourceType === "video" || attachment.resourceType === "raw"
          ? attachment.resourceType
          : "image",
      mimeType: attachment.mimeType,
      bytes: attachment.bytes,
      ...(attachment.width ? { width: attachment.width } : {}),
      ...(attachment.height ? { height: attachment.height } : {}),
      createdAt: attachment.createdAt.toISOString(),
    };
  }
}
