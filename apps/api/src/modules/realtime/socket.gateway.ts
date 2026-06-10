import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";
import {
  SocketAuthGuard,
  type SocketAuthenticatedUser,
} from "./socket-auth.guard.js";
import { SocketEvents, type SocketEventName } from "@chat/shared";
import type {
  TypingUpdatePayload,
  PresenceQueryPayload,
  PresenceStatePayload,
  SendMessageRequestDto,
  UpsertReceiptDto,
} from "@chat/shared";
import { PresenceService } from "./presence.service.js";

interface AuthenticatedSocket extends Socket {
  data: {
    user: SocketAuthenticatedUser;
    firebaseUid: string;
    userId: string; // DB user id
  };
}

@WebSocketGateway({
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const allowedOrigins = [
        process.env.CORS_ORIGIN ?? "http://localhost:3000",
        "http://127.0.0.1:3000",
      ];

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  },
  transports: ["websocket", "polling"],
  allowUpgrades: true,
})
export class SocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(SocketGateway.name);

  // chatId -> DB userId -> timestamp
  private typingState = new Map<string, Map<string, number>>();

  private readonly TYPING_TIMEOUT = 3000;
  private messageSocketService?: any;

  constructor(
    private readonly socketAuthGuard: SocketAuthGuard,
    private readonly presenceService: PresenceService,
  ) {}

  setMessageSocketService(service: any): void {
    this.messageSocketService = service;
  }

  afterInit(): void {
    this.logger.log("Socket.IO Gateway initialized");

    this.server.use(async (socket, next) => {
      try {
        const canActivate = await this.socketAuthGuard.canActivate({
          switchToWs: () => ({
            getClient: () => socket,
          }),
        } as any);

        if (canActivate) {
          next();
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Authentication failed";
        next(new Error(errorMsg));
      }
    });
  }

  async handleConnection(
    @ConnectedSocket() socket: AuthenticatedSocket,
  ): Promise<void> {
    const firebaseUid = socket.data.firebaseUid; // logging only
    const userId = socket.data.userId;
    const socketId = socket.id;

    this.logger.log(
      `Client connected: ${socketId} (userId: ${userId}, firebaseUid: ${firebaseUid})`,
    );

    socket.join(`user:${userId}`);

    const presence = await this.presenceService.markOnline(userId, socketId);

    if (presence.becameOnline) {
      await this.emitPresenceToAudience(
        userId,
        SocketEvents.presenceOnline,
        presence.payload,
      );
    }
  }

  async handleDisconnect(
    @ConnectedSocket() socket: AuthenticatedSocket,
  ): Promise<void> {
    const firebaseUid = socket.data.firebaseUid; // logging only
    const userId = socket.data.userId;
    const socketId = socket.id;

    const presence = await this.presenceService.markOffline(userId, socketId);

    if (presence.becameOffline) {
      await this.emitPresenceToAudience(
        userId,
        SocketEvents.presenceOffline,
        presence.payload,
      );

      for (const [chatId, typingMap] of this.typingState.entries()) {
        if (typingMap.has(userId)) {
          typingMap.delete(userId);

          if (typingMap.size === 0) {
            this.typingState.delete(chatId);
          }
        }
      }
    }

    this.logger.log(
      `Client disconnected: ${socketId} (userId: ${userId}, firebaseUid: ${firebaseUid})`,
    );
  }

  @SubscribeMessage(SocketEvents.messageSend)
  async handleMessageSend(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: SendMessageRequestDto,
  ): Promise<void> {
    const userId = socket.data.userId;

    this.logger.debug(
      `Message send event from userId ${userId}: ${JSON.stringify(payload)}`,
    );

    if (this.messageSocketService?.handleMessageSend) {
      await this.messageSocketService.handleMessageSend(socket, userId, payload);
    } else {
      socket.emit("message:send:ack", {
        clientMessageId: payload.clientMessageId,
        status: "received",
      });
    }
  }

  @SubscribeMessage(SocketEvents.messageReceiptUpsert)
  async handleReceiptUpsert(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: UpsertReceiptDto,
  ): Promise<void> {
    const userId = socket.data.userId;

    this.logger.debug(
      `Receipt upsert from userId ${userId}: ${JSON.stringify(payload)}`,
    );

    if (this.messageSocketService?.handleReceiptUpsert) {
      await this.messageSocketService.handleReceiptUpsert(
        socket,
        userId,
        payload,
      );
    } else {
      socket.emit("message:receipt:upsert:ack", {
        messageId: payload.messageId,
        status: "received",
      });
    }
  }

  @SubscribeMessage(SocketEvents.typingUpdate)
  handleTypingUpdate(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: TypingUpdatePayload,
  ): void {
    const userId = socket.data.userId;
    const chatId = payload.chatId;

    if (!this.typingState.has(chatId)) {
      this.typingState.set(chatId, new Map());
    }

    const typingMap = this.typingState.get(chatId)!;

    if (payload.isTyping) {
      typingMap.set(userId, Date.now());
    } else {
      typingMap.delete(userId);
    }

    for (const [typingUserId, ts] of typingMap.entries()) {
      if (Date.now() - ts >= this.TYPING_TIMEOUT) {
        typingMap.delete(typingUserId);
      }
    }

    const typingUsers = Array.from(typingMap.keys());

    this.server.to(`chat:${chatId}`).emit(SocketEvents.typingState, {
      chatId,
      typingUserIds: typingUsers,
      updatedAt: new Date().toISOString(),
    });

    this.logger.debug(
      `Typing update in chat ${chatId}: ${typingUsers.length} users typing`,
    );
  }

  @SubscribeMessage(SocketEvents.presenceQuery)
  async handlePresenceQuery(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: PresenceQueryPayload,
  ): Promise<void> {
    const userId = socket.data.userId;
    const userIds = payload.userIds;

    const presenceData = await this.presenceService.getPresence(userIds);

    socket.emit(SocketEvents.presenceState, presenceData);

    this.logger.debug(
      `Presence query from userId ${userId}: ${userIds.length} users`,
    );
  }

  @SubscribeMessage("chat:join")
  handleChatJoin(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: { chatId: string },
  ): void {
    const userId = socket.data.userId;
    const { chatId } = payload;

    this.joinChatRoom(socket, chatId);
    this.logger.log(`User ${userId} joined chat ${chatId}`);

    this.server.to(`chat:${chatId}`).emit("chat:member_joined", {
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage("chat:leave")
  handleChatLeave(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: { chatId: string },
  ): void {
    const userId = socket.data.userId;
    const { chatId } = payload;

    this.server.to(`chat:${chatId}`).emit("chat:member_left", {
      userId,
      timestamp: new Date().toISOString(),
    });

    this.leaveChatRoom(socket, chatId);
    this.logger.log(`User ${userId} left chat ${chatId}`);
  }

  joinChatRoom(socket: AuthenticatedSocket, chatId: string): void {
    socket.join(`chat:${chatId}`);
    this.logger.debug(`Socket ${socket.id} joined room chat:${chatId}`);
  }

  leaveChatRoom(socket: AuthenticatedSocket, chatId: string): void {
    socket.leave(`chat:${chatId}`);
    this.logger.debug(`Socket ${socket.id} left room chat:${chatId}`);
  }

  broadcastMessageToChat(
    chatId: string,
    eventName: SocketEventName,
    payload: unknown,
  ): void {
    this.server.to(`chat:${chatId}`).emit(eventName, payload);
  }

  broadcastToUser(
    userId: string,
    eventName: SocketEventName,
    payload: unknown,
  ): void {
    this.server.to(`user:${userId}`).emit(eventName, payload);
  }

  getUserSockets(userId: string): string[] {
    return [];
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const [presence] = await this.presenceService.getPresence([userId]);
    return presence?.state === "online";
  }

  private async emitPresenceToAudience(
    userId: string,
    eventName: typeof SocketEvents.presenceOnline | typeof SocketEvents.presenceOffline,
    payload: PresenceStatePayload,
  ): Promise<void> {
    const audience = await this.presenceService.getAudienceForUser(userId);

    for (const audienceUserId of audience.userIds) {
      this.server.to(`user:${audienceUserId}`).emit(eventName, payload);
    }

    for (const chatId of audience.chatIds) {
      this.server.to(`chat:${chatId}`).emit(eventName, payload);
    }
  }
}
