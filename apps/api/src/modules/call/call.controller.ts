import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  FirebaseAuthGuard,
  type AuthenticatedRequestUser,
} from "../auth/firebase-auth.guard.js";
import { GetUser } from "../auth/get-user.decorator.js";
import { CallService } from "./call.service.js";
import type {
  CallSessionDto,
  ChatDto,
  CreateCallRequestDto,
} from "@chat/shared";

@Controller("calls")
@UseGuards(FirebaseAuthGuard)
export class CallController {
  constructor(private readonly callService: CallService) {}

  @Post()
  async createCall(
    @GetUser() user: AuthenticatedRequestUser,
    @Body() request: CreateCallRequestDto,
  ): Promise<{ data: { call: CallSessionDto; chat: ChatDto } }> {
    const result = await this.callService.createCall(
      user.id ?? user.firebaseUid,
      request,
    );
    return { data: result };
  }

  @Post(":callId/answer")
  async answerCall(
    @GetUser() user: AuthenticatedRequestUser,
    @Param("callId") callId: string,
  ): Promise<{ data: CallSessionDto }> {
    const call = await this.callService.answerCall(
      user.id ?? user.firebaseUid,
      callId,
    );
    return { data: call };
  }

  @Post(":callId/end")
  async endCall(
    @GetUser() user: AuthenticatedRequestUser,
    @Param("callId") callId: string,
  ): Promise<{ data: CallSessionDto }> {
    const call = await this.callService.endCall(
      user.id ?? user.firebaseUid,
      callId,
    );
    return { data: call };
  }
}
