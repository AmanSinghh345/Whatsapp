import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import { SocketGateway } from "../realtime/socket.gateway.js";
import { SocketEvents } from "@chat/shared";
import type {
  CreateDirectChatRequestDto,
  CreateGroupChatRequestDto,
  UpdateGroupChatRequestDto,
  UpdateChatMemberRoleRequestDto,
  ChatDto,
  ChatInviteDto,
  ChatMemberDto,
  MessageDto,
} from "@chat/shared";
import type { Id } from "@chat/shared";

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => SocketGateway))
    private readonly socketGateway: SocketGateway,
  ) {}

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

    if (memberUserIds.length < 1) {
      throw new BadRequestException("Group chat must have at least one member");
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
        title: title.trim(),
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
    await this.createSystemMessage(
      chat.id,
      currentUserId,
      `${this.getMemberName(
        chat.members.find((member) => member.userId === currentUserId),
        "Someone",
      )} created the group`,
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
      include: {
        members: { include: { user: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            contentType: true,
            textContent: true,
            deletedAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit + 1, // Get one extra to determine if there's a next page
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });

    const hasMore = chats.length > limit;
    const paginatedChats = hasMore ? chats.slice(0, limit) : chats;
    const nextCursor = hasMore
      ? paginatedChats[paginatedChats.length - 1]!.id
      : null;

    const unreadCounts = await this.getUnreadCounts(
      paginatedChats.map((chat) => chat.id),
      userId,
    );

    return {
      chats: paginatedChats.map((chat) =>
        this.toChatDto(chat, unreadCounts.get(chat.id) ?? 0),
      ),
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
      const addedNames = newMemberIds.map((userId) =>
        this.getUserName(users.find((user) => user.id === userId), "someone"),
      );
      await this.createSystemMessage(
        chatId,
        currentUserId,
        `${this.getMemberName(userMembership, "Someone")} added ${this.formatNames(
          addedNames,
        )}`,
      );
    }

    const updated = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: { include: { user: true } } },
    });

    return this.toChatDto(updated!);
  }

  /**
   * Update group chat details
   */
  async updateGroupChat(
    chatId: string,
    currentUserId: string,
    request: UpdateGroupChatRequestDto,
  ): Promise<ChatDto> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: { include: { user: true } } },
    });

    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    if (chat.type !== "group") {
      throw new BadRequestException("Cannot edit direct chat details");
    }

    const userMembership = chat.members.find((m) => m.userId === currentUserId);
    if (!userMembership || userMembership.role !== "admin") {
      throw new ForbiddenException("Only admins can edit group details");
    }

    const data: { title?: string; avatarUrl?: string | null } = {};

    if (request.title !== undefined) {
      const title = request.title.trim();

      if (!title) {
        throw new BadRequestException("Group title is required");
      }

      data.title = title;
    }

    if (request.avatarUrl !== undefined) {
      data.avatarUrl = request.avatarUrl?.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      return this.toChatDto(chat);
    }

    const updated = await this.prisma.chat.update({
      where: { id: chatId },
      data,
      include: { members: { include: { user: true } } },
    });

    const actorName = this.getMemberName(userMembership, "Someone");
    if (data.title && data.title !== chat.title) {
      await this.createSystemMessage(
        chatId,
        currentUserId,
        `${actorName} changed the group name to ${data.title}`,
      );
    }

    if (data.avatarUrl !== undefined && data.avatarUrl !== chat.avatarUrl) {
      await this.createSystemMessage(
        chatId,
        currentUserId,
        `${actorName} changed the group icon`,
      );
    }

    this.logger.log(`Updated group chat ${chatId}`);
    return this.toChatDto(updated);
  }

  /**
   * Update group member role
   */
  async updateMemberRole(
    chatId: string,
    currentUserId: string,
    memberUserId: string,
    request: UpdateChatMemberRoleRequestDto,
  ): Promise<ChatDto> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: { include: { user: true } } },
    });

    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    if (chat.type !== "group") {
      throw new BadRequestException("Cannot edit roles in a direct chat");
    }

    if (request.role !== "admin" && request.role !== "member") {
      throw new BadRequestException("Role must be admin or member");
    }

    const currentUserMembership = chat.members.find(
      (m) => m.userId === currentUserId,
    );
    if (!currentUserMembership || currentUserMembership.role !== "admin") {
      throw new ForbiddenException("Only admins can edit member roles");
    }

    const targetMembership = chat.members.find((m) => m.userId === memberUserId);
    if (!targetMembership) {
      throw new NotFoundException("Member not found in this group");
    }

    if (targetMembership.role === request.role) {
      return this.toChatDto(chat);
    }

    const adminCount = chat.members.filter((member) => member.role === "admin")
      .length;
    if (targetMembership.role === "admin" && request.role === "member" && adminCount <= 1) {
      throw new BadRequestException("Group must have at least one admin");
    }

    await this.prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: memberUserId } },
      data: { role: request.role },
    });

    await this.createSystemMessage(
      chatId,
      currentUserId,
      `${this.getMemberName(currentUserMembership, "Someone")} ${
        request.role === "admin" ? "promoted" : "demoted"
      } ${this.getMemberName(targetMembership, "someone")}${
        request.role === "admin" ? " to admin" : ""
      }`,
    );

    const updated = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: { include: { user: true } } },
    });

    this.logger.log(
      `Updated role in chat ${chatId}: user=${memberUserId} role=${request.role}`,
    );
    return this.toChatDto(updated!);
  }

  async getActiveInvite(
    chatId: string,
    currentUserId: string,
  ): Promise<ChatInviteDto | null> {
    const chat = await this.getAdminGroupChat(chatId, currentUserId);
    const invite = await this.prisma.chatInvite.findFirst({
      where: { chatId: chat.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });

    return invite ? this.toChatInviteDto(invite) : null;
  }

  async createInvite(
    chatId: string,
    currentUserId: string,
  ): Promise<ChatInviteDto> {
    const chat = await this.getAdminGroupChat(chatId, currentUserId);

    await this.prisma.chatInvite.updateMany({
      where: { chatId: chat.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const invite = await this.prisma.chatInvite.create({
      data: {
        chatId: chat.id,
        createdById: currentUserId,
        token: this.createInviteToken(),
      },
    });

    await this.createSystemMessage(
      chat.id,
      currentUserId,
      `${this.getMemberName(
        chat.members.find((member) => member.userId === currentUserId),
        "Someone",
      )} created a group invite link`,
    );

    return this.toChatInviteDto(invite);
  }

  async revokeInvite(chatId: string, currentUserId: string): Promise<void> {
    const chat = await this.getAdminGroupChat(chatId, currentUserId);
    const result = await this.prisma.chatInvite.updateMany({
      where: { chatId: chat.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count > 0) {
      await this.createSystemMessage(
        chat.id,
        currentUserId,
        `${this.getMemberName(
          chat.members.find((member) => member.userId === currentUserId),
          "Someone",
        )} revoked the group invite link`,
      );
    }
  }

  async joinByInvite(token: string, currentUserId: string): Promise<ChatDto> {
    if (!token || token.trim().length < 16) {
      throw new BadRequestException("Invite link is invalid");
    }

    const invite = await this.prisma.chatInvite.findUnique({
      where: { token },
      include: {
        chat: {
          include: { members: { include: { user: true } } },
        },
      },
    });

    if (!invite || invite.revokedAt || invite.chat.type !== "group") {
      throw new NotFoundException("Invite link is invalid or expired");
    }

    const existingMember = invite.chat.members.find(
      (member) => member.userId === currentUserId,
    );
    if (existingMember) {
      return this.toChatDto(invite.chat);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.prisma.chatMember.create({
      data: {
        chatId: invite.chatId,
        userId: currentUserId,
        role: "member",
      },
    });

    await this.createSystemMessage(
      invite.chatId,
      currentUserId,
      `${this.getUserName(user, "Someone")} joined using an invite link`,
    );

    const updated = await this.prisma.chat.findUnique({
      where: { id: invite.chatId },
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

    if (chat.type !== "group") {
      throw new BadRequestException("Cannot remove members from a direct chat");
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

    const targetMembership = chat.members.find(
      (m) => m.userId === memberUserIdToRemove,
    );
    if (!targetMembership) {
      throw new NotFoundException("Member not found in this group");
    }

    const adminCount = chat.members.filter((member) => member.role === "admin")
      .length;
    if (targetMembership.role === "admin" && adminCount <= 1) {
      throw new BadRequestException("Group must have at least one admin");
    }

    const isLeaving = currentUserId === memberUserIdToRemove;
    await this.createSystemMessage(
      chatId,
      currentUserId,
      isLeaving
        ? `${this.getMemberName(currentUserMembership, "Someone")} left`
        : `${this.getMemberName(
            currentUserMembership,
            "Someone",
          )} removed ${this.getMemberName(targetMembership, "someone")}`,
    );

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

  private async getAdminGroupChat(chatId: string, userId: string) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: { include: { user: true } } },
    });

    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    if (chat.type !== "group") {
      throw new BadRequestException("Invite links are only available for groups");
    }

    const membership = chat.members.find((member) => member.userId === userId);
    if (!membership || membership.role !== "admin") {
      throw new ForbiddenException("Only admins can manage invite links");
    }

    return chat;
  }

  private createInviteToken(): string {
    return randomBytes(24).toString("base64url");
  }

  private async createSystemMessage(
    chatId: string,
    actorUserId: string,
    text: string,
  ): Promise<MessageDto> {
    const message = await this.prisma.message.create({
      data: {
        chatId,
        senderId: actorUserId,
        clientMessageId: `system:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        contentType: "system",
        textContent: text,
      },
      include: { attachments: true, receipts: true, reactions: true },
    });

    await this.prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: message.createdAt },
    });

    const chatMembers = await this.prisma.chatMember.findMany({
      where: { chatId, userId: { not: actorUserId } },
      select: { userId: true },
    });

    if (chatMembers.length > 0) {
      await this.prisma.messageReceipt.createMany({
        data: chatMembers.map((member) => ({
          messageId: message.id,
          recipientId: member.userId,
        })),
        skipDuplicates: true,
      });
    }

    const messageWithReceipts = await this.prisma.message.findUnique({
      where: { id: message.id },
      include: { attachments: true, receipts: true, reactions: true },
    });
    const dto = this.toSystemMessageDto(messageWithReceipts ?? message);

    this.socketGateway.broadcastMessageToChat(
      chatId,
      SocketEvents.messageNew,
      dto,
    );

    return dto;
  }

  private toChatInviteDto(invite: {
    id: string;
    chatId: string;
    token: string;
    createdById: string;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ChatInviteDto {
    return {
      id: invite.id,
      chatId: invite.chatId,
      token: invite.token,
      createdById: invite.createdById,
      ...(invite.revokedAt ? { revokedAt: invite.revokedAt.toISOString() } : {}),
      createdAt: invite.createdAt.toISOString(),
      updatedAt: invite.updatedAt.toISOString(),
    };
  }

  private getMemberName(
    member:
      | {
          userId: string;
          user?: {
            displayName?: string | null;
            phoneE164?: string | null;
            email?: string | null;
          } | null;
        }
      | undefined,
    fallback = "Someone",
  ): string {
    return (
      member?.user?.displayName ??
      member?.user?.phoneE164 ??
      member?.user?.email ??
      fallback
    );
  }

  private getUserName(
    user:
      | {
          displayName?: string | null;
          phoneE164?: string | null;
          email?: string | null;
        }
      | undefined,
    fallback = "Someone",
  ): string {
    return user?.displayName ?? user?.phoneE164 ?? user?.email ?? fallback;
  }

  private formatNames(names: string[]): string {
    if (names.length <= 1) {
      return names[0] ?? "someone";
    }

    if (names.length === 2) {
      return `${names[0]} and ${names[1]}`;
    }

    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  }

  private toSystemMessageDto(message: any): MessageDto {
    return {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      clientMessageId: message.clientMessageId,
      contentType: "system",
      text: message.textContent,
      attachments: [],
      receiptStatus: this.getReceiptStatus(message.receipts ?? []),
      receipts: message.receipts?.map((receipt: any) => ({
        recipientId: receipt.recipientId,
        ...(receipt.deliveredAt
          ? { deliveredAt: receipt.deliveredAt.toISOString() }
          : {}),
        ...(receipt.seenAt ? { seenAt: receipt.seenAt.toISOString() } : {}),
      })),
      reactions: [],
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
    };
  }

  /**
   * Convert Prisma Chat to DTO
   */
  private toChatDto(chat: any, unreadCount = 0): ChatDto {
    const lastMessage = chat.messages?.[0];

    return {
      id: chat.id,
      type: chat.type,
      ...(chat.title ? { title: chat.title } : {}),
      ...(chat.avatarUrl ? { avatarUrl: chat.avatarUrl } : {}),
      memberIds: chat.members?.map((member: any) => member.userId),
      members: chat.members?.map((member: any) => this.toChatMemberDto(member)),
      ...(lastMessage
        ? {
            lastMessagePreview: this.toMessagePreview(lastMessage),
            lastMessageAt: lastMessage.createdAt.toISOString(),
          }
        : {}),
      unreadCount,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
    };
  }

  private async getUnreadCounts(
    chatIds: string[],
    userId: string,
  ): Promise<Map<string, number>> {
    if (chatIds.length === 0) {
      return new Map();
    }

    const counts = await this.prisma.message.groupBy({
      by: ["chatId"],
      where: {
        chatId: { in: chatIds },
        senderId: { not: userId },
        receipts: {
          some: {
            recipientId: userId,
            seenAt: null,
          },
        },
      },
      _count: { _all: true },
    });

    return new Map(
      counts.map((item) => [item.chatId, item._count._all]),
    );
  }

  private toMessagePreview(message: {
    contentType: string;
    textContent?: string | null;
    deletedAt?: Date | null;
  }): string {
    if (message.deletedAt) {
      return "This message was deleted";
    }

    if (message.contentType === "system") {
      return message.textContent ?? "Call activity";
    }

    if (message.contentType === "attachment") {
      return message.textContent ?? "Attachment";
    }

    if (message.contentType === "game") {
      return message.textContent ?? "Game";
    }

    return message.textContent ?? "Message";
  }

  private getReceiptStatus(receipts: any[]): "sent" | "delivered" | "seen" {
    if (
      receipts.length > 0 &&
      receipts.every((receipt) => Boolean(receipt.seenAt))
    ) {
      return "seen";
    }

    if (
      receipts.length > 0 &&
      receipts.every((receipt) => Boolean(receipt.deliveredAt || receipt.seenAt))
    ) {
      return "delivered";
    }

    return "sent";
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
