import { Body, Controller, Get, Patch, Query, UseGuards } from "@nestjs/common";
import type { MeResponseDto, UpdateMeRequestDto, UserDto } from "@chat/shared";
import {
  FirebaseAuthGuard,
  type AuthenticatedRequestUser,
} from "../auth/firebase-auth.guard.js";
import { GetUser } from "../auth/get-user.decorator.js";
import { UserService } from "./user.service.js";

@Controller("users")
@UseGuards(FirebaseAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("me")
  async getMe(@GetUser() user: AuthenticatedRequestUser): Promise<MeResponseDto> {
    if (!user.id) {
      throw new Error("Authenticated user id is missing");
    }

    return { user: await this.userService.findById(user.id) };
  }

  @Patch("me")
  async updateMe(
    @GetUser() user: AuthenticatedRequestUser,
    @Body() body: UpdateMeRequestDto,
  ): Promise<{ data: UserDto }> {
    const userId = user.id;

    if (!userId) {
      throw new Error("Authenticated user id is missing");
    }

    const updated = await this.userService.updateMe(userId, body);
    return { data: updated };
  }

  @Get("search")
  async searchByPhone(
    @Query("phone") phone: string | undefined,
  ): Promise<{ data: UserDto }> {
    if (!phone) {
      throw new Error("phone query parameter is required");
    }

    const found = await this.userService.findByPhone(phone);
    return { data: found };
  }
}
