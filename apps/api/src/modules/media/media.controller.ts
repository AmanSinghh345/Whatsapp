import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard.js";
import { MediaService } from "./media.service.js";
import type {
  CloudinaryAssetDto,
  ConfirmUploadRequestDto,
  CreateUploadSignatureRequestDto,
  CreateUploadSignatureResponseDto,
} from "@chat/shared";

@Controller("media")
@UseGuards(FirebaseAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post("upload-signature")
  createUploadSignature(
    @Body() request: CreateUploadSignatureRequestDto,
  ): CreateUploadSignatureResponseDto {
    return this.mediaService.createUploadSignature(request);
  }

  @Post("confirm")
  async confirmUpload(
    @Body() request: ConfirmUploadRequestDto,
  ): Promise<{ data: CloudinaryAssetDto }> {
    const asset = await this.mediaService.confirmUpload(request);
    return { data: asset };
  }

  @Get(":assetId")
  async getAsset(
    @Param("assetId") assetId: string,
  ): Promise<{ data: CloudinaryAssetDto }> {
    const asset = await this.mediaService.getAsset(assetId);
    return { data: asset };
  }
}
