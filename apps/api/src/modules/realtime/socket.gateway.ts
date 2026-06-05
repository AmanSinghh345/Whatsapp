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

  // DB userId -> socket ids
  private userConnections = new Map<string, Set<string>>();

  // chatId -> DB userId -> timestamp
  private typingState = new Map<string, Map<string, number>>();

  private readonly TYPING_TIMEOUT = 3000;
  private messageSocketService?: any;

  constructor(private readonly socketAuthGuard: SocketAuthGuard) {}

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

    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }

    this.userConnections.get(userId)!.add(socketId);

    this.logger.log(
      `Client connected: ${socketId} (userId: ${userId}, firebaseUid: ${firebaseUid})`,
    );

    socket.join(`user:${userId}`);

    this.server.emit(SocketEvents.presenceOnline, {
      userId,
      state: "online",
      updatedAt: new Date().toISOString(),
    } as PresenceStatePayload);
  }

  async handleDisconnect(
    @ConnectedSocket() socket: AuthenticatedSocket,
  ): Promise<void> {
    const firebaseUid = socket.data.firebaseUid; // logging only
    const userId = socket.data.userId;
    const socketId = socket.id;

    const userSockets = this.userConnections.get(userId);

    if (userSockets) {
      userSockets.delete(socketId);

      if (userSockets.size === 0) {
        this.userConnections.delete(userId);

        this.server.emit(SocketEvents.presenceOffline, {
          userId,
          state: "offline",
          lastSeenAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as PresenceStatePayload);

        for (const [chatId, typingMap] of this.typingState.entries()) {
          if (typingMap.has(userId)) {
            typingMap.delete(userId);

            if (typingMap.size === 0) {
              this.typingState.delete(chatId);
            }
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
  handlePresenceQuery(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: PresenceQueryPayload,
  ): void {
    const userId = socket.data.userId;
    const userIds = payload.userIds;

    const presenceData = userIds.map((targetUserId) => ({
      userId: targetUserId,
      state: this.userConnections.has(targetUserId) ? "online" : "offline",
      updatedAt: new Date().toISOString(),
    })) as PresenceStatePayload[];

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
    return Array.from(this.userConnections.get(userId) || []);
  }

  isUserOnline(userId: string): boolean {
    const sockets = this.userConnections.get(userId);
    return sockets ? sockets.size > 0 : false;
  }
}