import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { UserDto } from "@chat/shared";
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

    const user = await this.prisma.user.upsert({
      where: { firebaseUid },
      create: {
        firebaseUid,
        email,
        phoneE164,
        displayName,
        avatarUrl
      },
      update: {
        email,
        phoneE164,
        displayName,
        avatarUrl
      }
    });

    const dto: UserDto = {
      id: user.id,
      firebaseUid: user.firebaseUid,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    };

    if (user.avatarUrl) {
      dto.avatarUrl = user.avatarUrl;
    }
    if (user.email) {
      dto.email = user.email;
    }
    if (user.phoneE164) {
      dto.phoneE164 = user.phoneE164;
    }

    return dto;
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
}
