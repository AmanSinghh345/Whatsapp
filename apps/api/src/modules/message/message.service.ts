import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { ChatService } from "../chat/chat.service.js";
import type {
  SendMessageRequestDto,
  MessageDto,
  UpsertReceiptDto,
  MessageReceiptStatus,
} from "@chat/shared";

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
  ) {}

  /**
   * Send a message to a chat
   * Idempotent via (chatId, senderId, clientMessageId) unique constraint
   */
  async sendMessage(
    userId: string,
    request: SendMessageRequestDto,
  ): Promise<MessageDto> {
    const { chatId, clientMessageId, contentType, text, attachmentIds } =
      request;

    // Verify user is member of chat
    await this.chatService.getChat(chatId, userId);

    // Validate content
    if (contentType === "text" && !text?.trim()) {
      throw new BadRequestException(
        "Text content is required for text messages",
      );
    }

    if (contentType === "attachment" && !attachmentIds?.length) {
      throw new BadRequestException(
        "Attachment IDs are required for attachment messages",
      );
    }

    // Check if message already exists (idempotency)
    const existingMessage = await this.prisma.message.findFirst({
      where: {
        chatId,
        senderId: userId,
        clientMessageId,
      },
      include: { attachments: true },
    });

    if (existingMessage) {
      this.logger.debug(
        `Message already exists (idempotent): chatId=${chatId}, clientMessageId=${clientMessageId}`,
      );
      return this.toMessageDto(existingMessage);
    }

    const messageData = {
      chatId,
      senderId: userId,
      clientMessageId,
      contentType,
      textContent: text ?? null,
      ...(attachmentIds?.length
        ? {
            attachments: {
              connect: attachmentIds.map((id) => ({ id })),
            },
          }
        : {}),
    };

    // Create message
    const message = await this.prisma.message.create({
      data: messageData,
      include: { attachments: true },
    });

    // Create receipts for all other chat members
    const chatMembers = await this.prisma.chatMember.findMany({
      where: {
        chatId,
        userId: { not: userId },
      },
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

    this.logger.log(
      `Message sent: ${message.id} to chat ${chatId} by user ${userId}`,
    );

    return this.toMessageDto(message);
  }

  /**
   * Get message history for a chat (cursor-based pagination)
   */
  async getMessages(
    chatId: string,
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ messages: MessageDto[]; nextCursor: string | null }> {
    // Verify user is member of chat
    await this.chatService.getChat(chatId, userId);

    // Fetch messages in reverse chronological order
    const messages = await this.prisma.message.findMany({
      where: { chatId },
      include: { attachments: true },
      orderBy: { createdAt: "desc" },
      take: limit + 1, // Get one extra to determine if there's a next page
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });

    const hasMore = messages.length > limit;
    const paginatedMessages = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore
      ? paginatedMessages[paginatedMessages.length - 1]!.id
      : null;

    return {
      messages: paginatedMessages
        .reverse()
        .map((msg) => this.toMessageDto(msg)),
      nextCursor,
    };
  }

  /**
   * Get single message
   */
  async getMessage(messageId: string, userId: string): Promise<MessageDto> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { attachments: true },
    });

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    // Verify user is member of the chat containing this message
    await this.chatService.getChat(message.chatId, userId);

    return this.toMessageDto(message);
  }

  /**
   * Get receipts for a message
   */
  async getMessageReceipts(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        receipts: {
          include: { recipient: true },
        },
      },
    });

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    // Verify user is sender or in the chat
    await this.chatService.getChat(message.chatId, userId);

    return message.receipts.map((receipt) => ({
      recipientId: receipt.recipientId,
      recipientName: receipt.recipient.displayName,
      deliveredAt: receipt.deliveredAt?.toISOString() || null,
      seenAt: receipt.seenAt?.toISOString() || null,
    }));
  }

  /**
   * Update message receipt (mark as delivered or seen)
   */
  async upsertReceipt(
    userId: string,
    request: UpsertReceiptDto,
  ): Promise<void> {
    const { messageId, chatId, status } = request;

    // Verify message exists and belongs to chat
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.chatId !== chatId) {
      throw new NotFoundException(
        `Message ${messageId} not found in chat ${chatId}`,
      );
    }

    // Verify user is member of chat
    await this.chatService.getChat(chatId, userId);

    // Update receipt
    const updateData: any = {};
    if (status === "delivered") {
      updateData.deliveredAt = new Date();
    } else if (status === "seen") {
      updateData.seenAt = new Date();
      updateData.deliveredAt = new Date(); // Ensure delivered is set
    }

    await this.prisma.messageReceipt.updateMany({
      where: {
        messageId,
        recipientId: userId,
      },
      data: updateData,
    });

    this.logger.debug(
      `Message receipt updated: ${messageId} for user ${userId} status=${status}`,
    );
  }

  /**
   * Delete message (only sender or admins can delete)
   */
  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    // Check permissions
    if (message.senderId !== userId) {
      // Check if user is admin of the chat
      const chatMember = await this.prisma.chatMember.findUnique({
        where: {
          chatId_userId: {
            chatId: message.chatId,
            userId,
          },
        },
      });

      if (!chatMember || chatMember.role !== "admin") {
        throw new ForbiddenException("You can only delete your own messages");
      }
    }

    await this.prisma.message.delete({
      where: { id: messageId },
    });

    this.logger.log(`Message deleted: ${messageId}`);
  }

  /**
   * Get message count for a chat
   */
  async getMessageCount(chatId: string): Promise<number> {
    return this.prisma.message.count({
      where: { chatId },
    });
  }

  /**
   * Convert Prisma Message to DTO
   */
  private toMessageDto(message: any): MessageDto {
    return {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      clientMessageId: message.clientMessageId,
      contentType: message.contentType,
      text: message.textContent,
      attachments: message.attachments?.map((att: any) => ({
        id: att.id,
        url: att.url,
        cloudinaryPublicId: att.cloudinaryPublicId,
        mimeType: att.mimeType,
        bytes: att.bytes,
        width: att.width,
        height: att.height,
      })),
      createdAt: message.createdAt.toISOString(),
    };
  }
}
