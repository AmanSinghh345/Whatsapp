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
  MessageReceiptUpdatedDto,
  MessageReactionEmoji,
  MessageReactionSummaryDto,
  MessageReactionUpdatedDto,
  EditMessageRequestDto,
  PlayGameActionRequestDto,
  RpsChoice,
  TicTacToeCell,
} from "@chat/shared";

const ALLOWED_REACTION_EMOJIS: readonly MessageReactionEmoji[] = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🙏",
  "🔥",
  "👏",
  "🎉",
  "💯",
  "😎",
  "😭",
  "🤔",
  "👀",
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

const GAMEBOT_FIREBASE_UID = "system:gamebot";

type RpsGameData = {
  kind: "rps";
  status: "waiting" | "finished";
  createdByUserId: string;
  choices: Record<string, { choice: RpsChoice; chosenAt: string }>;
  result?: {
    status: "waiting" | "tie" | "winner";
    winnerUserId?: string;
    reason?: string;
  };
};

type TicTacToeMark = "x" | "o";

type TicTacToeGameData = {
  kind: "tic-tac-toe";
  status: "waiting" | "playing" | "finished";
  createdByUserId: string;
  players: {
    x?: string;
    o?: string;
  };
  board: Array<TicTacToeMark | null>;
  nextTurn: TicTacToeMark;
  moves: Array<{
    userId: string;
    mark: TicTacToeMark;
    cell: TicTacToeCell;
    playedAt: string;
  }>;
  result?: {
    status: "waiting" | "tie" | "winner";
    winnerUserId?: string;
    winningCells?: TicTacToeCell[];
    reason?: string;
  };
};

type GameData = RpsGameData | TicTacToeGameData;

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

    if (contentType === "text" && text?.trim().startsWith("/")) {
      await this.handleGameBotCommand(userId, chatId, text.trim());
    }

    return dto;
  }

  async playGameAction(
    messageId: string,
    userId: string,
    request: PlayGameActionRequestDto,
  ): Promise<MessageDto> {
    this.assertUuid(messageId, "messageId");

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: MESSAGE_INCLUDE,
    });

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    await this.chatService.getChat(message.chatId, userId);

    if (message.contentType !== "game") {
      throw new BadRequestException("Message is not a game");
    }

    const gameData = this.asGameData(message.gameData);

    if (!gameData || gameData.status === "finished") {
      throw new BadRequestException("This game is already finished");
    }

    let nextGameData: GameData;

    if (gameData.kind === "rps") {
      if (request.action !== "choose") {
        throw new BadRequestException("RPS requires a choice action");
      }

      if (!["rock", "paper", "scissors"].includes(request.choice)) {
        throw new BadRequestException("Invalid RPS choice");
      }

      nextGameData = this.resolveRpsGame({
        ...gameData,
        choices: {
          ...gameData.choices,
          [userId]: {
            choice: request.choice,
            chosenAt: new Date().toISOString(),
          },
        },
      });
    } else {
      if (request.action !== "place") {
        throw new BadRequestException("Tic Tac Toe requires a place action");
      }

      nextGameData = this.placeTicTacToeMove(gameData, userId, request.cell);
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { gameData: nextGameData as any },
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

  async upsertReceipt(
    userId: string,
    request: UpsertReceiptDto,
  ): Promise<MessageReceiptUpdatedDto | null> {
    const { messageId, chatId, status } = request;

    this.assertUuid(messageId, "messageId");
    this.assertUuid(chatId, "chatId");

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, chatId: true, senderId: true },
    });

    if (!message || message.chatId !== chatId) {
      throw new NotFoundException(
        `Message ${messageId} not found in chat ${chatId}`,
      );
    }

    await this.chatService.getChat(chatId, userId);

    if (message.senderId === userId) {
      return null;
    }

    const existingReceipt = await this.prisma.messageReceipt.findUnique({
      where: { messageId_recipientId: { messageId, recipientId: userId } },
    });
    const now = new Date();
    const updateData =
      status === "seen"
        ? {
            ...(existingReceipt?.deliveredAt ? {} : { deliveredAt: now }),
            ...(existingReceipt?.seenAt ? {} : { seenAt: now }),
          }
          : existingReceipt?.deliveredAt || existingReceipt?.seenAt
            ? {}
            : { deliveredAt: now };
    const shouldBroadcast =
      !existingReceipt || Object.keys(updateData).length > 0;
    const receipt = existingReceipt
      ? Object.keys(updateData).length > 0
        ? await this.prisma.messageReceipt.update({
            where: {
              messageId_recipientId: { messageId, recipientId: userId },
            },
            data: updateData,
          })
        : existingReceipt
      : await this.prisma.messageReceipt.create({
          data: {
            messageId,
            recipientId: userId,
            ...(status === "seen"
              ? { deliveredAt: now, seenAt: now }
              : { deliveredAt: now }),
          },
        });

    const payload: MessageReceiptUpdatedDto = {
      chatId,
      messageId,
      recipientId: userId,
      status: receipt.seenAt ? "seen" : "delivered",
      updatedAt: receipt.updatedAt.toISOString(),
      ...(receipt.deliveredAt
        ? { deliveredAt: receipt.deliveredAt.toISOString() }
        : {}),
      ...(receipt.seenAt ? { seenAt: receipt.seenAt.toISOString() } : {}),
    };

    this.logger.debug(
      `Message receipt updated: ${messageId} for user ${userId} status=${payload.status}`,
    );

    if (shouldBroadcast) {
      this.socketGateway.broadcastMessageToChat(
        chatId,
        SocketEvents.messageReceiptUpdated,
        payload,
      );
    }

    return payload;
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

  private async handleGameBotCommand(
    userId: string,
    chatId: string,
    commandText: string,
  ): Promise<void> {
    const normalized = commandText.trim().toLowerCase();

    if (normalized === "/help") {
      await this.createGameBotMessage(chatId, {
        contentType: "text",
        textContent:
          "GameBot ready.\n\n/play rps - Rock Paper Scissors\n/play ttt - Tic Tac Toe\n/roll - Roll a die\n/help - Show commands",
      });
      return;
    }

    if (normalized === "/roll") {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });
      const roll = Math.floor(Math.random() * 6) + 1;
      await this.createGameBotMessage(chatId, {
        contentType: "text",
        textContent: `Dice roll\n${user?.displayName ?? "Player"} rolled a ${roll}.`,
      });
      return;
    }

    if (normalized === "/play rps") {
      const gameData: RpsGameData = {
        kind: "rps",
        status: "waiting",
        createdByUserId: userId,
        choices: {},
        result: { status: "waiting" },
      };

      await this.createGameBotMessage(chatId, {
        contentType: "game",
        textContent: "Rock Paper Scissors - choose your move",
        gameData,
      });
      return;
    }

    if (normalized === "/play ttt" || normalized === "/play tic-tac-toe") {
      const gameData: TicTacToeGameData = {
        kind: "tic-tac-toe",
        status: "waiting",
        createdByUserId: userId,
        players: {},
        board: Array.from({ length: 9 }, () => null),
        nextTurn: "x",
        moves: [],
        result: { status: "waiting" },
      };

      await this.createGameBotMessage(chatId, {
        contentType: "game",
        textContent: "Tic Tac Toe - claim a square",
        gameData,
      });
      return;
    }

    if (normalized.startsWith("/play")) {
      await this.createGameBotMessage(chatId, {
        contentType: "text",
        textContent:
          "I can start these games right now:\n\n/play rps\n/play ttt",
      });
    }
  }

  private async getGameBotUserId(): Promise<string> {
    const bot = await this.prisma.user.upsert({
      where: { firebaseUid: GAMEBOT_FIREBASE_UID },
      update: {
        displayName: "GameBot",
        avatarUrl: null,
      },
      create: {
        firebaseUid: GAMEBOT_FIREBASE_UID,
        displayName: "GameBot",
        email: null,
        phoneE164: null,
        avatarUrl: null,
      },
      select: { id: true },
    });

    return bot.id;
  }

  private async createGameBotMessage(
    chatId: string,
    data: {
      contentType: "text" | "game";
      textContent: string;
      gameData?: GameData;
    },
  ): Promise<MessageDto> {
    const botUserId = await this.getGameBotUserId();
    const message = await this.prisma.message.create({
      data: {
        chatId,
        senderId: botUserId,
        clientMessageId: `gamebot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        contentType: data.contentType,
        textContent: data.textContent,
        ...(data.gameData ? { gameData: data.gameData as any } : {}),
      },
      include: MESSAGE_INCLUDE,
    });

    await this.prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: message.createdAt },
    });

    const chatMembers = await this.prisma.chatMember.findMany({
      where: { chatId },
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
      include: MESSAGE_INCLUDE,
    });
    const dto = this.toMessageDto(messageWithReceipts ?? message);

    this.socketGateway.broadcastMessageToChat(
      chatId,
      SocketEvents.messageNew,
      dto,
    );

    return dto;
  }

  private asGameData(value: unknown): GameData | null {
    return this.asRpsGameData(value) ?? this.asTicTacToeGameData(value);
  }

  private asRpsGameData(value: unknown): RpsGameData | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const data = value as Partial<RpsGameData>;
    if (data.kind !== "rps") {
      return null;
    }

    return {
      kind: "rps",
      status: data.status === "finished" ? "finished" : "waiting",
      createdByUserId: String(data.createdByUserId ?? ""),
      choices: data.choices ?? {},
      result: data.result ?? { status: "waiting" },
    };
  }

  private asTicTacToeGameData(value: unknown): TicTacToeGameData | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const data = value as Partial<TicTacToeGameData>;
    if (data.kind !== "tic-tac-toe") {
      return null;
    }

    const board = Array.isArray(data.board)
      ? data.board.slice(0, 9).map((cell) =>
          cell === "x" || cell === "o" ? cell : null,
        )
      : [];

    while (board.length < 9) {
      board.push(null);
    }

    return {
      kind: "tic-tac-toe",
      status:
        data.status === "finished"
          ? "finished"
          : data.status === "playing"
            ? "playing"
            : "waiting",
      createdByUserId: String(data.createdByUserId ?? ""),
      players: {
        ...(data.players?.x ? { x: String(data.players.x) } : {}),
        ...(data.players?.o ? { o: String(data.players.o) } : {}),
      },
      board,
      nextTurn: data.nextTurn === "o" ? "o" : "x",
      moves: Array.isArray(data.moves) ? data.moves : [],
      result: data.result ?? { status: "waiting" },
    };
  }

  private resolveRpsGame(gameData: RpsGameData): RpsGameData {
    const entries = Object.entries(gameData.choices).sort(
      (a, b) =>
        new Date(a[1].chosenAt).getTime() - new Date(b[1].chosenAt).getTime(),
    );

    if (entries.length < 2) {
      return {
        ...gameData,
        status: "waiting",
        result: { status: "waiting" },
      };
    }

    const [first, second] = entries;
    const [firstUserId, firstChoice] = first!;
    const [secondUserId, secondChoice] = second!;

    if (firstChoice.choice === secondChoice.choice) {
      return {
        ...gameData,
        status: "finished",
        result: { status: "tie", reason: "Both players chose the same move." },
      };
    }

    const winningPairs: Record<RpsChoice, RpsChoice> = {
      rock: "scissors",
      paper: "rock",
      scissors: "paper",
    };
    const winnerUserId =
      winningPairs[firstChoice.choice] === secondChoice.choice
        ? firstUserId
        : secondUserId;

    return {
      ...gameData,
      status: "finished",
      result: { status: "winner", winnerUserId },
    };
  }

  private placeTicTacToeMove(
    gameData: TicTacToeGameData,
    userId: string,
    cell: TicTacToeCell,
  ): TicTacToeGameData {
    if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
      throw new BadRequestException("Invalid Tic Tac Toe cell");
    }

    if (gameData.board[cell]) {
      throw new BadRequestException("That cell is already taken");
    }

    const players = { ...gameData.players };
    let mark: TicTacToeMark | undefined =
      players.x === userId ? "x" : players.o === userId ? "o" : undefined;

    if (!mark) {
      if (!players.x) {
        players.x = userId;
        mark = "x";
      } else if (!players.o) {
        players.o = userId;
        mark = "o";
      } else {
        throw new BadRequestException("This game already has two players");
      }
    }

    if (mark !== gameData.nextTurn) {
      throw new BadRequestException("It is not your turn");
    }

    const board = [...gameData.board];
    board[cell] = mark;
    const moves = [
      ...gameData.moves,
      {
        userId,
        mark,
        cell,
        playedAt: new Date().toISOString(),
      },
    ];

    return this.resolveTicTacToeGame({
      ...gameData,
      status: players.x && players.o ? "playing" : "waiting",
      players,
      board,
      nextTurn: mark === "x" ? "o" : "x",
      moves,
    });
  }

  private resolveTicTacToeGame(
    gameData: TicTacToeGameData,
  ): TicTacToeGameData {
    const winningLines: TicTacToeCell[][] = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];

    for (const line of winningLines) {
      const [a, b, c] = line;
      const mark = gameData.board[a!];

      if (mark && mark === gameData.board[b!] && mark === gameData.board[c!]) {
        const winnerUserId =
          mark === "x" ? gameData.players.x : gameData.players.o;

        return {
          ...gameData,
          status: "finished",
          result: {
            status: "winner",
            ...(winnerUserId ? { winnerUserId } : {}),
            winningCells: line,
          },
        };
      }
    }

    if (gameData.board.every(Boolean)) {
      return {
        ...gameData,
        status: "finished",
        result: { status: "tie", reason: "The board is full." },
      };
    }

    return {
      ...gameData,
      result: { status: "waiting" },
    };
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
      ...(message.deletedAt || !message.gameData
        ? {}
        : { gameData: message.gameData }),
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
}
