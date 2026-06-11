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
  BadRequestException,
  ParseUUIDPipe,
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
  SearchMessagesResponseDto,
  MessageReactionEmoji,
  MessageReactionUpdatedDto,
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
    @Query("chatId", new ParseUUIDPipe()) chatId: string,
    @Query("cursor", new ParseUUIDPipe({ optional: true })) cursor?: string,
    @Query("limit") limit?: string,
  ): Promise<{ data: MessageDto[]; nextCursor: string | null }> {
    const pageSize = this.parseLimit(limit, 20, 100);
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
   * Search text messages within a chat (paginated)
   * GET /api/messages/search?chatId=XXX&q=hello&cursor=YYY&limit=20
   */
  @Get("search")
  async searchMessages(
    @GetUser() user: AuthenticatedRequestUser,
    @Query("chatId", new ParseUUIDPipe()) chatId: string,
    @Query("q") query: string,
    @Query("cursor", new ParseUUIDPipe({ optional: true })) cursor?: string,
    @Query("limit") limit?: string,
  ): Promise<SearchMessagesResponseDto> {
    if (!query) {
      throw new BadRequestException("q query parameter is required");
    }

    const pageSize = this.parseLimit(limit, 20, 50);
    const result = await this.messageService.searchMessages(
      chatId,
      user.id ?? user.firebaseUid,
      query,
      cursor,
      pageSize,
    );

    return {
      data: result.messages,
      nextCursor: result.nextCursor,
    };
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
    @Body("messageId", new ParseUUIDPipe()) messageId: string,
    @Body("chatId", new ParseUUIDPipe()) chatId: string,
    @Body("status") status: UpsertReceiptDto["status"],
    @Body("clientReceivedAt") clientReceivedAt?: UpsertReceiptDto["clientReceivedAt"],
  ): Promise<void> {
    if (status !== "delivered" && status !== "seen") {
      throw new BadRequestException("status must be delivered or seen");
    }

    const request: UpsertReceiptDto = {
      messageId,
      chatId,
      status,
      ...(clientReceivedAt ? { clientReceivedAt } : {}),
    };

    await this.messageService.upsertReceipt(user.id ?? user.firebaseUid, request);
  }

  /**
   * Get receipt status for a message
   * GET /api/messages/:messageId/receipts
   */
  @Get(":messageId/receipts")
  async getReceipts(
    @GetUser() user: AuthenticatedRequestUser,
    @Param("messageId", new ParseUUIDPipe()) messageId: string,
  ): Promise<{ data: any[] }> {
    const receipts = await this.messageService.getMessageReceipts(
      messageId,
      user.id ?? user.firebaseUid,
    );
    return { data: receipts };
  }

  /**
   * Toggle current user's reaction for a message
   * POST /api/messages/:messageId/reactions
   * Body: { emoji: MessageReactionEmoji }
   */
  @Post(":messageId/reactions")
  async toggleReaction(
    @GetUser() user: AuthenticatedRequestUser,
    @Param("messageId", new ParseUUIDPipe()) messageId: string,
    @Body("emoji") emoji: MessageReactionEmoji,
  ): Promise<{ data: MessageReactionUpdatedDto }> {
    const result = await this.messageService.toggleReaction(
      messageId,
      user.id ?? user.firebaseUid,
      emoji,
    );
    return { data: result };
  }

  /**
   * Get single message by ID
   * GET /api/messages/:messageId
   */
  @Get(":messageId")
  async getMessage(
    @GetUser() user: AuthenticatedRequestUser,
    @Param("messageId", new ParseUUIDPipe()) messageId: string,
  ): Promise<{ data: MessageDto }> {
    const message = await this.messageService.getMessage(
      messageId,
      user.id ?? user.firebaseUid,
    );
    return { data: message };
  }

  /**
   * Delete a message
   * DELETE /api/messages/:messageId
   */
  @Delete(":messageId")
  @HttpCode(204)
  async deleteMessage(
    @GetUser() user: AuthenticatedRequestUser,
    @Param("messageId", new ParseUUIDPipe()) messageId: string,
  ): Promise<void> {
    await this.messageService.deleteMessage(messageId, user.id ?? user.firebaseUid);
  }

  private parseLimit(
    value: string | undefined,
    defaultValue: number,
    maxValue: number,
  ): number {
    if (value === undefined) {
      return defaultValue;
    }

    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException("limit must be a positive integer");
    }

    return Math.min(parsed, maxValue);
  }
}
