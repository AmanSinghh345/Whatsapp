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
import { ChatService } from "./chat.service.js";
import type {
  ChatDto,
  CreateDirectChatRequestDto,
  CreateGroupChatRequestDto,
  ChatMemberDto,
} from "@chat/shared";

@Controller("chats")
@UseGuards(FirebaseAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Create a direct or group chat
   * POST /api/chats
   * Body:
   *   - For direct: { otherUserId: string }
   *   - For group: { title: string, memberUserIds: string[] }
   */
  @Post()
  async createChat(
    @GetUser() user: AuthenticatedRequestUser,
    @Body() body: any,
  ): Promise<{ data: ChatDto }> {
    const userId = user.id;

    if (!userId) {
      throw new Error("Authenticated user id is missing");
    }

    let chat: ChatDto;

    if (body.otherUserId) {
      // Create direct chat
      chat = await this.chatService.createDirectChat(userId, {
        otherUserId: body.otherUserId,
      } as CreateDirectChatRequestDto);
    } else if (body.title && Array.isArray(body.memberUserIds)) {
      // Create group chat
      chat = await this.chatService.createGroupChat(userId, {
        title: body.title,
        memberUserIds: body.memberUserIds,
      } as CreateGroupChatRequestDto);
    } else {
      throw new Error("Invalid chat creation request");
    }

    return { data: chat };
  }

  /**
   * Get all chats for current user (paginated)
   * GET /api/chats?cursor=xxx&limit=20
   */
  @Get()
  async getChats(
    @GetUser() user: AuthenticatedRequestUser,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ): Promise<{ data: ChatDto[]; nextCursor: string | null }> {
    const pageSize = limit ? Math.min(parseInt(limit), 100) : 20;
    const result = await this.chatService.getChatsByUser(
      user.id ?? user.firebaseUid,
      cursor,
      pageSize,
    );
    return {
      data: result.chats,
      nextCursor: result.nextCursor,
    };
  }

  /**
   * Get single chat by ID
   * GET /api/chats/:chatId
   */
  @Get(":chatId")
  async getChat(
    @GetUser() user: AuthenticatedRequestUser,
    @Param("chatId") chatId: string,
  ): Promise<{ data: ChatDto }> {
    const chat = await this.chatService.getChat(chatId, user.id ?? user.firebaseUid);
    return { data: chat };
  }

  /**
   * Get chat members
   * GET /api/chats/:chatId/members
   */
  @Get(":chatId/members")
  async getChatMembers(
    @GetUser() user: AuthenticatedRequestUser,
    @Param("chatId") chatId: string,
  ): Promise<{ data: ChatMemberDto[] }> {
    const members = await this.chatService.getChatMembers(
      chatId,
      user.id ?? user.firebaseUid,
    );
    return { data: members };
  }

  /**
   * Add members to group chat
   * POST /api/chats/:chatId/members
   * Body: { memberUserIds: string[] }
   */
  @Post(":chatId/members")
  async addMembers(
    @GetUser() user: AuthenticatedRequestUser,
    @Param("chatId") chatId: string,
    @Body("memberUserIds") memberUserIds: string[],
  ): Promise<{ data: ChatDto }> {
    const chat = await this.chatService.addMembers(
      chatId,
      user.id ?? user.firebaseUid,
      memberUserIds,
    );
    return { data: chat };
  }

  /**
   * Remove member from chat
   * DELETE /api/chats/:chatId/members/:userId
   */
  @Delete(":chatId/members/:userId")
  @HttpCode(204)
  async removeMember(
    @GetUser() user: AuthenticatedRequestUser,
    @Param("chatId") chatId: string,
    @Param("userId") userIdToRemove: string,
  ): Promise<void> {
    await this.chatService.removeMember(
      chatId,
      user.id ?? user.firebaseUid,
      userIdToRemove,
    );
  }

  /**
   * Delete chat
   * DELETE /api/chats/:chatId
   */
  @Delete(":chatId")
  @HttpCode(204)
  async deleteChat(
    @GetUser() user: AuthenticatedRequestUser,
    @Param("chatId") chatId: string,
  ): Promise<void> {
    await this.chatService.deleteChat(chatId, user.id ?? user.firebaseUid);
  }
}
