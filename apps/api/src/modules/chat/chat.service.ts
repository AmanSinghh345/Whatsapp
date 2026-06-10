import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type {
  CreateDirectChatRequestDto,
  CreateGroupChatRequestDto,
  ChatDto,
  ChatMemberDto,
} from "@chat/shared";
import type { Id } from "@chat/shared";

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a direct chat between two users
   */
  async createDirectChat(
    currentUserId: string,
    request: CreateDirectChatRequestDto,
  ): Promise<ChatDto> {
    const { otherUserId } = request;

    if (currentUserId === otherUserId) {
      throw new BadRequestException("Cannot create chat with yourself");
    }

    // Check if both users exist
    const [currentUser, otherUser] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: currentUserId } }),
      this.prisma.user.findUnique({ where: { id: otherUserId } }),
    ]);

    if (!currentUser || !otherUser) {
      throw new NotFoundException("One or both users not found");
    }

    // Check if direct chat already exists
    const existingChat = await this.findExistingDirectChat(
      currentUserId,
      otherUserId,
    );
    if (existingChat) {
      this.logger.debug(
        `Direct chat already exists between ${currentUserId} and ${otherUserId}`,
      );
      return this.toChatDto(existingChat);
    }

    // Create new direct chat
    const chat = await this.prisma.chat.create({
      data: {
        type: "direct",
        members: {
          createMany: {
            data: [
              { userId: currentUserId, role: "member" },
              { userId: otherUserId, role: "member" },
            ],
          },
        },
      },
      include: { members: { include: { user: true } } },
    });

    this.logger.log(
      `Created direct chat ${chat.id} between ${currentUserId} and ${otherUserId}`,
    );
    return this.toChatDto(chat);
  }

  /**
   * Create a group chat
   */
  async createGroupChat(
    currentUserId: string,
    request: CreateGroupChatRequestDto,
  ): Promise<ChatDto> {
    const { title, memberUserIds } = request;

    if (!title || title.trim().length === 0) {
      throw new BadRequestException("Chat title is required");
    }

    if (memberUserIds.length < 2) {
      throw new BadRequestException("Group chat must have at least 2 members");
    }

    // Ensure creator is in members list
    const allMemberIds = Array.from(new Set([currentUserId, ...memberUserIds]));

    // Verify all users exist
    const users = await this.prisma.user.findMany({
      where: { id: { in: allMemberIds } },
    });

    if (users.length !== allMemberIds.length) {
      throw new NotFoundException("One or more users not found");
    }

    // Create group chat with creator as admin
    const chat = await this.prisma.chat.create({
      data: {
        type: "group",
        title,
        members: {
          createMany: {
            data: allMemberIds.map((userId) => ({
              userId,
              role: userId === currentUserId ? "admin" : "member",
            })),
          },
        },
      },
      include: { members: { include: { user: true } } },
    });

    this.logger.log(
      `Created group chat ${chat.id}: "${title}" with ${allMemberIds.length} members`,
    );
    return this.toChatDto(chat);
  }

  /**
   * Get chats for current user with cursor-based pagination
   */
  async getChatsByUser(
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ chats: ChatDto[]; nextCursor: string | null }> {
    const chats = await this.prisma.chat.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      include: { members: { include: { user: true } } },
      orderBy: { updatedAt: "desc" },
      take: limit + 1, // Get one extra to determine if there's a next page
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });

    const hasMore = chats.length > limit;
    const paginatedChats = hasMore ? chats.slice(0, limit) : chats;
    const nextCursor = hasMore
      ? paginatedChats[paginatedChats.length - 1]!.id
      : null;

    return {
      chats: paginatedChats.map((chat) => this.toChatDto(chat)),
      nextCursor,
    };
  }

  /**
   * Get single chat with members
   */
  async getChat(chatId: string, userId: string): Promise<ChatDto> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: { include: { user: true } } },
    });

    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    // Verify user is member of chat
    const isMember = chat.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenException("You are not a member of this chat");
    }

    return this.toChatDto(chat);
  }

  /**
   * Get chat members
   */
  async getChatMembers(
    chatId: string,
    userId: string,
  ): Promise<ChatMemberDto[]> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: { include: { user: true } } },
    });

    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    // Verify user is member
    const isMember = chat.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenException("You are not a member of this chat");
    }

    return chat.members.map((m) => this.toChatMemberDto(m));
  }

  /**
   * Add members to group chat
   */
  async addMembers(
    chatId: string,
    currentUserId: string,
    memberUserIds: string[],
  ): Promise<ChatDto> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: { include: { user: true } } },
    });

    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    if (chat.type !== "group") {
      throw new BadRequestException("Cannot add members to a direct chat");
    }

    // Verify current user is admin
    const userMembership = chat.members.find((m) => m.userId === currentUserId);
    if (!userMembership || userMembership.role !== "admin") {
      throw new ForbiddenException("Only admins can add members");
    }

    // Verify new members exist
    const users = await this.prisma.user.findMany({
      where: { id: { in: memberUserIds } },
    });

    if (users.length !== memberUserIds.length) {
      throw new NotFoundException("One or more users not found");
    }

    // Add new members (skip if already member)
    const existingMemberIds = new Set(chat.members.map((m) => m.userId));
    const newMemberIds = memberUserIds.filter(
      (id) => !existingMemberIds.has(id),
    );

    if (newMemberIds.length > 0) {
      await this.prisma.chatMember.createMany({
        data: newMemberIds.map((userId) => ({
          chatId,
          userId,
          role: "member",
        })),
        skipDuplicates: true,
      });

      this.logger.log(`Added ${newMemberIds.length} members to chat ${chatId}`);
    }

    const updated = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: { include: { user: true } } },
    });

    return this.toChatDto(updated!);
  }

  /**
   * Remove member from chat
   */
  async removeMember(
    chatId: string,
    currentUserId: string,
    memberUserIdToRemove: string,
  ): Promise<void> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: { include: { user: true } } },
    });

    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    const currentUserMembership = chat.members.find(
      (m) => m.userId === currentUserId,
    );
    if (!currentUserMembership) {
      throw new ForbiddenException("You are not a member of this chat");
    }

    // Allow user to remove themselves, or admin to remove others
    if (
      currentUserId !== memberUserIdToRemove &&
      currentUserMembership.role !== "admin"
    ) {
      throw new ForbiddenException("Only admins can remove other members");
    }

    await this.prisma.chatMember.deleteMany({
      where: {
        chatId,
        userId: memberUserIdToRemove,
      },
    });

    this.logger.log(`Removed user ${memberUserIdToRemove} from chat ${chatId}`);
  }

  /**
   * Delete chat (only creator can delete, for direct chats or group chat admin)
   */
  async deleteChat(chatId: string, currentUserId: string): Promise<void> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: { include: { user: true } } },
    });

    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    const userMembership = chat.members.find((m) => m.userId === currentUserId);
    if (!userMembership || userMembership.role !== "admin") {
      throw new ForbiddenException("Only admins can delete chats");
    }

    await this.prisma.chat.delete({
      where: { id: chatId },
    });

    this.logger.log(`Deleted chat ${chatId}`);
  }

  /**
   * Private helper: Find existing direct chat between two users
   */
  private async findExistingDirectChat(userId1: string, userId2: string) {
    return this.prisma.chat.findFirst({
      where: {
        type: "direct",
        members: {
          every: {
            userId: { in: [userId1, userId2] },
          },
        },
      },
      include: { members: { include: { user: true } } },
    });
  }

  /**
   * Convert Prisma Chat to DTO
   */
  private toChatDto(chat: any): ChatDto {
    return {
      id: chat.id,
      type: chat.type,
      ...(chat.title ? { title: chat.title } : {}),
      ...(chat.avatarUrl ? { avatarUrl: chat.avatarUrl } : {}),
      memberIds: chat.members?.map((member: any) => member.userId),
      members: chat.members?.map((member: any) => this.toChatMemberDto(member)),
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
    };
  }

  /**
   * Convert Prisma ChatMember to DTO
   */
  private toChatMemberDto(member: any): ChatMemberDto {
    return {
      chatId: member.chatId,
      userId: member.userId,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
      ...(member.user ? { user: this.toUserDto(member.user) } : {}),
    };
  }

  private toUserDto(user: any) {
    return {
      id: user.id,
      firebaseUid: user.firebaseUid,
      ...(user.email ? { email: user.email } : {}),
      ...(user.phoneE164 ? { phoneE164: user.phoneE164 } : {}),
      displayName: user.displayName,
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      ...(user.lastSeenAt ? { lastSeenAt: user.lastSeenAt.toISOString() } : {}),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
