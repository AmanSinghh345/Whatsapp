import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { UpdateMeRequestDto, UserDto } from "@chat/shared";
import type { AuthenticatedRequestUser } from "../auth/firebase-auth.guard.js";

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async syncFromAuthUser(authUser: AuthenticatedRequestUser): Promise<UserDto> {
    const firebaseUid = authUser.firebaseUid;
    const email = authUser.email ?? null;
    const phoneE164 = authUser.phoneE164 ?? null;
    const displayName = this.pickDisplayName(authUser);
    const avatarUrl = authUser.avatarUrl ?? null;
    const updateData = {
      ...(authUser.email !== undefined ? { email } : {}),
      ...(authUser.phoneE164 !== undefined ? { phoneE164 } : {}),
    };

    const user = await this.prisma.user.upsert({
      where: { firebaseUid },
      create: {
        firebaseUid,
        email,
        phoneE164,
        displayName,
        avatarUrl
      },
      update: updateData
    });

    return this.toUserDto(user);
  }

  async updateMe(userId: string, request: UpdateMeRequestDto): Promise<UserDto> {
    const data: {
      displayName?: string;
      phoneE164?: string | null;
      avatarUrl?: string | null;
    } = {};

    if (request.displayName !== undefined) {
      const displayName = request.displayName.trim();
      if (!displayName) {
        throw new BadRequestException("Display name is required");
      }
      data.displayName = displayName;
    }

    if (request.phoneE164 !== undefined) {
      data.phoneE164 =
        request.phoneE164 === null || request.phoneE164.trim() === ""
          ? null
          : this.normalizePhone(request.phoneE164);
    }

    if (request.avatarUrl !== undefined) {
      data.avatarUrl =
        request.avatarUrl.trim() === "" ? null : request.avatarUrl.trim();
    }

    if (data.phoneE164) {
      const existing = await this.prisma.user.findUnique({
        where: { phoneE164: data.phoneE164 },
      });

      if (existing && existing.id !== userId) {
        throw new ConflictException("Phone number is already in use");
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    return this.toUserDto(user);
  }

  async findById(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return this.toUserDto(user);
  }

  async findByPhone(phoneE164: string): Promise<UserDto> {
    const normalizedPhone = this.normalizePhone(phoneE164);
    const user = await this.prisma.user.findUnique({
      where: { phoneE164: normalizedPhone },
    });

    if (!user) {
      throw new NotFoundException("No user found for that phone number");
    }

    return this.toUserDto(user);
  }

  private pickDisplayName(authUser: AuthenticatedRequestUser): string {
    if (typeof authUser.displayName === "string" && authUser.displayName.trim().length > 0) {
      return authUser.displayName.trim();
    }
    if (typeof authUser.phoneE164 === "string" && authUser.phoneE164.trim().length > 0) {
      return authUser.phoneE164.trim();
    }
    return "New User";
  }

  private normalizePhone(phoneE164: string): string {
    const normalized = phoneE164.trim().replace(/\s+/g, "");

    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      throw new BadRequestException("Phone number must be in E.164 format");
    }

    return normalized;
  }

  private toUserDto(user: {
    id: string;
    firebaseUid: string;
    email: string | null;
    phoneE164: string | null;
    displayName: string;
    avatarUrl: string | null;
    lastSeenAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): UserDto {
    const dto: UserDto = {
      id: user.id,
      firebaseUid: user.firebaseUid,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };

    if (user.avatarUrl) {
      dto.avatarUrl = user.avatarUrl;
    }
    if (user.lastSeenAt) {
      dto.lastSeenAt = user.lastSeenAt.toISOString();
    }
    if (user.email) {
      dto.email = user.email;
    }
    if (user.phoneE164) {
      dto.phoneE164 = user.phoneE164;
    }

    return dto;
  }
}
