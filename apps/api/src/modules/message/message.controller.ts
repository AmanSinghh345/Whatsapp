import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
} from "@nestjs/common";
import {
  FirebaseAuthGuard,
  type AuthenticatedRequestUser,
} from "../auth/firebase-auth.guard.js";
import { GetUser } from "../auth/get-user.decorator.js";
import { MessageService } from "./message.service.js";
import type {
  MessageDto,
  SendMessageRequestDto,
  UpsertReceiptDto,
} from "@chat/shared";

@Controller("messages")
@UseGuards(FirebaseAuthGuard)
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  /**
   * Send a message to a chat
   * POST /api/messages
   * Body: SendMessageRequestDto
   */
  @Post()
  async sendMessage(
    @GetUser() user: AuthenticatedRequestUser,
    @Body() request: SendMessageRequestDto,
  ): Promise<{ data: MessageDto }> {
    const message = await this.messageService.sendMessage(
      user.id ?? user.firebaseUid,
      request,
    );
    return { data: message };
  }

  /**
   * Get message history for a chat (paginated)
   * GET /api/messages?chatId=XXX&cursor=YYY&limit=20
   */
  @Get()
  async getMessages(
    @GetUser() user: AuthenticatedRequestUser,
    @Query("chatId") chatId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ): Promise<{ data: MessageDto[]; nextCursor: string | null }> {
    if (!chatId) {
      throw new Error("chatId query parameter is required");
    }

    const pageSize = limit ? Math.min(parseInt(limit), 100) : 20;
    const result = await this.messageService.getMessages(
      chatId,
      user.id ?? user.firebaseUid,
      cursor,
      pageSize,
    );

    return {
      data: result.messages,
      nextCursor: result.nextCursor,
    };
  }

  /**
   * Get single message by ID
   * GET /api/messages/:messageId
   */
  @Get(":messageId")
  async getMessage(
    @GetUser() user: AuthenticatedRequestUser,
    @Param("messageId") messageId: string,
  ): Promise<{ data: MessageDto }> {
    const message = await this.messageService.getMessage(
      messageId,
      user.id ?? user.firebaseUid,
    );
    return { data: message };
  }

  /**
   * Get receipt status for a message
   * GET /api/messages/:messageId/receipts
   */
  @Get(":messageId/receipts")
  async getReceipts(
    @GetUser() user: AuthenticatedRequestUser,
    @Param("messageId") messageId: string,
  ): Promise<{ data: any[] }> {
    const receipts = await this.messageService.getMessageReceipts(
      messageId,
      user.id ?? user.firebaseUid,
    );
    return { data: receipts };
  }

  /**
   * Update message receipt (mark as delivered/seen)
   * POST /api/messages/receipt/upsert
   * Body: UpsertReceiptDto
   */
  @Post("receipt/upsert")
  @HttpCode(204)
  async upsertReceipt(
    @GetUser() user: AuthenticatedRequestUser,
    @Body() request: UpsertReceiptDto,
  ): Promise<void> {
    await this.messageService.upsertReceipt(user.id ?? user.firebaseUid, request);
  }

  /**
   * Delete a message
   * DELETE /api/messages/:messageId
   */
  @Delete(":messageId")
  @HttpCode(204)
  async deleteMessage(
    @GetUser() user: AuthenticatedRequestUser,
    @Param("messageId") messageId: string,
  ): Promise<void> {
    await this.messageService.deleteMessage(messageId, user.id ?? user.firebaseUid);
  }
}
