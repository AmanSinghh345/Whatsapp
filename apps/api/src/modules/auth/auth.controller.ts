import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { MeResponseDto } from "@chat/shared";
import { FirebaseAuthGuard, type AuthenticatedRequestUser } from "./firebase-auth.guard.js";
import { UserService } from "../user/user.service.js";

@Controller()
export class AuthController {
  constructor(private readonly userService: UserService) {}

  @Get("me")
  @UseGuards(FirebaseAuthGuard)
  async getMe(
    @Req()
    request: {
      user: AuthenticatedRequestUser;
    }
  ): Promise<MeResponseDto> {
    const appUser = await this.userService.syncFromAuthUser(request.user);
    return { user: appUser };
  }
}

