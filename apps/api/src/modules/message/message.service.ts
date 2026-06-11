import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { ChatService } from "../chat/chat.service.js";
import { SocketGateway } from "../realtime/socket.gateway.js";
import { SocketEvents } from "@chat/shared";
import type {
  SendMessageRequestDto,
  MessageDto,
  UpsertReceiptDto,
  MessageReactionEmoji,
  MessageReactionSummaryDto,
  MessageReactionUpdatedDto,
  EditMessageRequestDto,
} from "@chat/shared";

const ALLOWED_REACTION_EMOJIS: readonly MessageReactionEmoji[] = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
];

const MESSAGE_INCLUDE = {
  attachments: true,
  receipts: true,
  reactions: true,
  replyTo: {
    select: {
      id: true,
      senderId: true,
      contentType: true,
      textContent: true,
      deletedAt: true,
    },
  },
} as const;

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => SocketGateway))
    private readonly socketGateway: SocketGateway,
  ) {}

  async sendMessage(
    userId: string,
    request: SendMessageRequestDto,
  ): Promise<MessageDto> {
    const { chatId, clientMessageId, contentType, text, attachmentIds, replyToMessageId } =
      request;

    this.assertUuid(chatId, "chatId");
    this.assertOptionalUuid(replyToMessageId, "replyToMessageId");
    attachmentIds?.forEach((attachmentId) =>
      this.assertUuid(attachmentId, "attachmentIds"),
    );

    await this.chatService.getChat(chatId, userId);
    await this.assertReplyTarget(chatId, replyToMessageId);

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

    if (attachmentIds?.length) {
      const stagedAttachments = await this.prisma.messageAttachment.findMany({
        where: {
          id: { in: attachmentIds },
          messageId: null,
        },
        select: { id: true },
      });

      if (stagedAttachments.length !== attachmentIds.length) {
        throw new BadRequestException(
          "One or more attachments are missing or already used",
        );
      }
    }

    const existingMessage = await this.prisma.message.findFirst({
      where: { chatId, senderId: userId, clientMessageId },
      include: MESSAGE_INCLUDE,
    });

    if (existingMessage) {
      this.logger.debug(
        `Message already exists (idempotent): chatId=${chatId}, clientMessageId=${clientMessageId}`,
      );
      return this.toMessageDto(existingMessage);
    }

    const message = await this.prisma.message.create({
      data: {
        chatId,
        senderId: userId,
        clientMessageId,
        contentType,
        textContent: text ?? null,
        ...(replyToMessageId ? { replyToMessageId } : {}),
        ...(attachmentIds?.length
          ? { attachments: { connect: attachmentIds.map((id) => ({ id })) } }
          : {}),
      },
      include: { attachments: true },
    });
    await this.prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: message.createdAt },
    });

    const chatMembers = await this.prisma.chatMember.findMany({
      where: { chatId, userId: { not: userId } },
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

    const messageWithReceipts = await this.prisma.message.findUnique({
      where: { id: message.id },
      include: MESSAGE_INCLUDE,
    });
    const dto = this.toMessageDto(messageWithReceipts ?? message);

    try {
      this.socketGateway.broadcastMessageToChat(
        chatId,
        SocketEvents.messageNew,
        dto,
      );
      this.logger.debug(`Broadcast message:new to chat:${chatId}`);
    } catch (e) {
      this.logger.warn(`Socket broadcast failed (non-fatal): ${e}`);
    }

    return dto;
  }

  async getMessages(
    chatId: string,
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ messages: MessageDto[]; nextCursor: string | null }> {
    this.assertUuid(chatId, "chatId");
    this.assertOptionalUuid(cursor, "cursor");

    await this.chatService.getChat(chatId, userId);

    const messages = await this.prisma.message.findMany({
      where: { chatId },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });

    const hasMore = messages.length > limit;
    const paginatedMessages = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore
      ? paginatedMessages[paginatedMessages.length - 1]!.id
      : null;

    return {
      messages: paginatedMessages.reverse().map((msg) => this.toMessageDto(msg)),
      nextCursor,
    };
  }

  async getMessage(messageId: string, userId: string): Promise<MessageDto> {
    this.assertUuid(messageId, "messageId");

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: MESSAGE_INCLUDE,
    });

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    await this.chatService.getChat(message.chatId, userId);
    return this.toMessageDto(message);
  }

  async searchMessages(
    chatId: string,
    userId: string,
    query: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ messages: MessageDto[]; nextCursor: string | null }> {
    this.assertUuid(chatId, "chatId");
    this.assertOptionalUuid(cursor, "cursor");

    await this.chatService.getChat(chatId, userId);

    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      throw new BadRequestException("Search query must be at least 2 characters");
    }

    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        contentType: "text",
        textContent: {
          contains: trimmedQuery,
          mode: "insensitive",
        },
      },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });

    const hasMore = messages.length > limit;
    const paginatedMessages = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore
      ? paginatedMessages[paginatedMessages.length - 1]!.id
      : null;

    return {
      messages: paginatedMessages.map((message) => this.toMessageDto(message)),
      nextCursor,
    };
  }

  async getMessageReceipts(messageId: string, userId: string) {
    this.assertUuid(messageId, "messageId");

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { receipts: { include: { recipient: true } } },
    });

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    await this.chatService.getChat(message.chatId, userId);

    return message.receipts.map((receipt) => ({
      recipientId: receipt.recipientId,
      recipientName: receipt.recipient.displayName,
      deliveredAt: receipt.deliveredAt?.toISOString() || null,
      seenAt: receipt.seenAt?.toISOString() || null,
    }));
  }

  async upsertReceipt(userId: string, request: UpsertReceiptDto): Promise<void> {
    const { messageId, chatId, status } = request;

    this.assertUuid(messageId, "messageId");
    this.assertUuid(chatId, "chatId");

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.chatId !== chatId) {
      throw new NotFoundException(
        `Message ${messageId} not found in chat ${chatId}`,
      );
    }

    await this.chatService.getChat(chatId, userId);

    const updateData: any = {};
    if (status === "delivered") {
      updateData.deliveredAt = new Date();
    } else if (status === "seen") {
      updateData.seenAt = new Date();
      updateData.deliveredAt = new Date();
    }

    await this.prisma.messageReceipt.updateMany({
      where: { messageId, recipientId: userId },
      data: updateData,
    });

    this.logger.debug(
      `Message receipt updated: ${messageId} for user ${userId} status=${status}`,
    );

    this.socketGateway.broadcastMessageToChat(
      chatId,
      SocketEvents.messageReceiptUpdated,
      {
        messageId,
        recipientId: userId,
        status,
        updatedAt: new Date().toISOString(),
      },
    );
  }

  async toggleReaction(
    messageId: string,
    userId: string,
    emoji: MessageReactionEmoji,
  ): Promise<MessageReactionUpdatedDto> {
    this.assertUuid(messageId, "messageId");
    this.assertReactionEmoji(emoji);

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, chatId: true, deletedAt: true },
    });

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    if (message.deletedAt) {
      throw new BadRequestException("Cannot react to a deleted message");
    }

    await this.chatService.getChat(message.chatId, userId);

    const existingReaction = await this.prisma.messageReaction.findUnique({
      where: { messageId_userId: { messageId, userId } },
    });

    let reactionAction: "created" | "updated" | "removed";

    if (existingReaction?.emoji === emoji) {
      await this.prisma.messageReaction.delete({
        where: { messageId_userId: { messageId, userId } },
      });
      reactionAction = "removed";
    } else if (existingReaction) {
      await this.prisma.messageReaction.update({
        where: { messageId_userId: { messageId, userId } },
        data: { emoji },
      });
      reactionAction = "updated";
    } else {
      await this.prisma.messageReaction.create({
        data: { messageId, userId, emoji },
      });
      reactionAction = "created";
    }

    this.logger.log(
      `[reaction] saved action=${reactionAction} messageId=${messageId} userId=${userId} emoji=${emoji}`,
    );

    const reactions = await this.getReactionSummaries(messageId);
    const payload = {
      chatId: message.chatId,
      messageId,
      reactions,
    };
    const room = `chat:${message.chatId}`;

    this.logger.log(`[reaction] emit room=${room}`);
    this.logger.log(`[reaction] payload=${JSON.stringify(payload)}`);

    this.socketGateway.broadcastMessageToChat(
      message.chatId,
      SocketEvents.messageReactionUpdated,
      payload,
    );

    return payload;
  }

  async editMessage(
    messageId: string,
    userId: string,
    request: EditMessageRequestDto,
  ): Promise<MessageDto> {
    this.assertUuid(messageId, "messageId");

    const nextText = request.text?.trim();
    if (!nextText) {
      throw new BadRequestException("Text content is required");
    }

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: MESSAGE_INCLUDE,
    });

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException("You can only edit your own messages");
    }

    if (message.deletedAt) {
      throw new BadRequestException("Cannot edit a deleted message");
    }

    if (message.contentType !== "text") {
      throw new BadRequestException("Only text messages can be edited");
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { textContent: nextText },
      include: MESSAGE_INCLUDE,
    });
    const dto = this.toMessageDto(updated);

    this.socketGateway.broadcastMessageToChat(
      updated.chatId,
      SocketEvents.messageEdited,
      {
        chatId: updated.chatId,
        message: dto,
      },
    );

    return dto;
  }

  async deleteMessage(messageId: string, userId: string): Promise<MessageDto> {
    this.assertUuid(messageId, "messageId");

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: MESSAGE_INCLUDE,
    });

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    if (message.deletedAt) {
      const dto = this.toMessageDto(message);
      this.socketGateway.broadcastMessageToChat(
        message.chatId,
        SocketEvents.messageDeleted,
        {
          chatId: message.chatId,
          message: dto,
        },
      );
      return dto;
    }

    if (message.senderId !== userId) {
      const chatMember = await this.prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId: message.chatId, userId } },
      });

      if (!chatMember || chatMember.role !== "admin") {
        throw new ForbiddenException("You can only delete your own messages");
      }
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        textContent: null,
        reactions: { deleteMany: {} },
      },
      include: MESSAGE_INCLUDE,
    });
    const dto = this.toMessageDto(updated);

    this.socketGateway.broadcastMessageToChat(
      updated.chatId,
      SocketEvents.messageDeleted,
      {
        chatId: updated.chatId,
        message: dto,
      },
    );

    this.logger.log(`Message deleted: ${messageId}`);
    return dto;
  }

  async getMessageCount(chatId: string): Promise<number> {
    this.assertUuid(chatId, "chatId");

    return this.prisma.message.count({ where: { chatId } });
  }

  private assertOptionalUuid(value: string | undefined, fieldName: string): void {
    if (value !== undefined) {
      this.assertUuid(value, fieldName);
    }
  }

  private async assertReplyTarget(
    chatId: string,
    replyToMessageId?: string,
  ): Promise<void> {
    if (!replyToMessageId) {
      return;
    }

    const replyTo = await this.prisma.message.findUnique({
      where: { id: replyToMessageId },
      select: { id: true, chatId: true, contentType: true },
    });

    if (!replyTo || replyTo.chatId !== chatId) {
      throw new BadRequestException("Reply target must be in this chat");
    }

    if (replyTo.contentType === "system") {
      throw new BadRequestException("Cannot reply to system messages");
    }
  }

  private assertUuid(value: string, fieldName: string): void {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(value)) {
      throw new BadRequestException(`${fieldName} must be a valid UUID`);
    }
  }

  private assertReactionEmoji(value: string): asserts value is MessageReactionEmoji {
    if (!ALLOWED_REACTION_EMOJIS.includes(value as MessageReactionEmoji)) {
      throw new BadRequestException("Unsupported reaction emoji");
    }
  }

  private getReactionSummaries(
    messageId: string,
  ): Promise<MessageReactionSummaryDto[]> {
    return this.prisma.messageReaction
      .findMany({
        where: { messageId },
        select: { emoji: true, userId: true },
        orderBy: { createdAt: "asc" },
      })
      .then((reactions) => this.toReactionSummaries(reactions));
  }

  private toReactionSummaries(
    reactions: Array<{ emoji: string; userId: string }> = [],
  ): MessageReactionSummaryDto[] {
    const summariesByEmoji = new Map<MessageReactionEmoji, Set<string>>();

    for (const reaction of reactions) {
      if (!ALLOWED_REACTION_EMOJIS.includes(reaction.emoji as MessageReactionEmoji)) {
        continue;
      }

      const emoji = reaction.emoji as MessageReactionEmoji;
      const userIds = summariesByEmoji.get(emoji) ?? new Set<string>();
      userIds.add(reaction.userId);
      summariesByEmoji.set(emoji, userIds);
    }

    return ALLOWED_REACTION_EMOJIS.flatMap((emoji) => {
      const userIds = Array.from(summariesByEmoji.get(emoji) ?? []);
      return userIds.length > 0
        ? [{ emoji, count: userIds.length, userIds }]
        : [];
    });
  }

  private toMessageDto(message: any): MessageDto {
    return {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      ...(message.replyToMessageId
        ? { replyToMessageId: message.replyToMessageId }
        : {}),
      ...(message.replyTo
        ? {
            replyTo: {
              id: message.replyTo.id,
              senderId: message.replyTo.senderId,
              contentType: message.replyTo.contentType,
              text: message.replyTo.deletedAt
                ? undefined
                : message.replyTo.textContent,
              ...(message.replyTo.deletedAt
                ? { deletedAt: message.replyTo.deletedAt.toISOString() }
                : {}),
            },
          }
        : {}),
      clientMessageId: message.clientMessageId,
      contentType: message.contentType,
      text: message.deletedAt ? null : message.textContent,
      attachments: message.deletedAt
        ? []
        : message.attachments?.map((att: any) => ({
            id: att.id,
            url: att.url,
            cloudinaryPublicId: att.cloudinaryPublicId,
            resourceType: att.resourceType,
            mimeType: att.mimeType,
            bytes: att.bytes,
            width: att.width,
            height: att.height,
          })),
      receiptStatus: this.getReceiptStatus(message.receipts ?? []),
      receipts: message.receipts?.map((receipt: any) => ({
        recipientId: receipt.recipientId,
        ...(receipt.deliveredAt
          ? { deliveredAt: receipt.deliveredAt.toISOString() }
          : {}),
        ...(receipt.seenAt ? { seenAt: receipt.seenAt.toISOString() } : {}),
      })),
      reactions: message.deletedAt
        ? []
        : this.toReactionSummaries(message.reactions ?? []),
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
      ...(message.updatedAt.getTime() !== message.createdAt.getTime() &&
      !message.deletedAt
        ? { editedAt: message.updatedAt.toISOString() }
        : {}),
      ...(message.deletedAt
        ? { deletedAt: message.deletedAt.toISOString() }
        : {}),
    };
  }

  private getReceiptStatus(receipts: any[]): "sent" | "delivered" | "seen" {
    if (receipts.some((receipt) => Boolean(receipt.seenAt))) {
      return "seen";
    }

    if (receipts.length > 0 && receipts.every((receipt) => Boolean(receipt.deliveredAt))) {
      return "delivered";
    }

    return "sent";
  }
}
