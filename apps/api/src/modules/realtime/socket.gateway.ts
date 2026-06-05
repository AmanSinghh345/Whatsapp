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
  TypingStatePayload,
  PresenceQueryPayload,
  PresenceStatePayload,
  SendMessageRequestDto,
  UpsertReceiptDto,
  WebRtcSignalDto,
} from "@chat/shared";

interface AuthenticatedSocket extends Socket {
  data: {
    user: SocketAuthenticatedUser;
    firebaseUid: string;
  };
}

@WebSocketGateway({
  namespace: "/socket.io",
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
  server: Server;

  private readonly logger = new Logger(SocketGateway.name);

  // Track active connections per user
  private userConnections = new Map<string, Set<string>>();

  // Track typing state: chatId -> Map<userId, timestamp>
  private typingState = new Map<string, Map<string, number>>();

  // Typing timeout duration (ms)
  private readonly TYPING_TIMEOUT = 3000;
  private messageSocketService?: any;

  constructor(private readonly socketAuthGuard: SocketAuthGuard) {}

  // Inject MessageSocketService after module initialization to avoid circular dependency
  setMessageSocketService(service: any): void {
    this.messageSocketService = service;
  }

  afterInit(): void {
    this.logger.log("Socket.IO Gateway initialized");

    // Add authentication middleware
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
    const firebaseUid = socket.data.firebaseUid;
    const socketId = socket.id;

    // Track user connections
    if (!this.userConnections.has(firebaseUid)) {
      this.userConnections.set(firebaseUid, new Set());
    }
    this.userConnections.get(firebaseUid)!.add(socketId);

    this.logger.log(`Client connected: ${socketId} (user: ${firebaseUid})`);

    // Join user-specific room for direct messaging
    socket.join(`user:${firebaseUid}`);

    // Emit online presence
    this.server.emit(SocketEvents.presenceOnline, {
      userId: firebaseUid,
      state: "online",
      updatedAt: new Date().toISOString(),
    } as PresenceStatePayload);
  }

  async handleDisconnect(
    @ConnectedSocket() socket: AuthenticatedSocket,
  ): Promise<void> {
    const firebaseUid = socket.data.firebaseUid;
    const socketId = socket.id;

    // Remove user connection tracking
    const userSockets = this.userConnections.get(firebaseUid);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.userConnections.delete(firebaseUid);

        // Emit offline presence only if no other connections
        this.server.emit(SocketEvents.presenceOffline, {
          userId: firebaseUid,
          state: "offline",
          lastSeenAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as PresenceStatePayload);

        // Clean up typing state for this user
        for (const [chatId, typingMap] of this.typingState.entries()) {
          if (typingMap.has(firebaseUid)) {
            typingMap.delete(firebaseUid);
            if (typingMap.size === 0) {
              this.typingState.delete(chatId);
            }
          }
        }
      }
    }

    this.logger.log(`Client disconnected: ${socketId} (user: ${firebaseUid})`);
  }

  /**
   * Client sends a message.
   * Delegates validation, persistence, and broadcasting to the message service.
   */
  @SubscribeMessage(SocketEvents.messageSend)
  async handleMessageSend(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: SendMessageRequestDto,
  ): Promise<void> {
    const firebaseUid = socket.data.firebaseUid;

    this.logger.debug(
      `Message send event from ${firebaseUid}: ${JSON.stringify(payload)}`,
    );

    // Delegate to MessageSocketService for persistence and broadcasting
    if (this.messageSocketService?.handleMessageSend) {
      await this.messageSocketService.handleMessageSend(
        socket,
        firebaseUid,
        payload,
      );
    } else {
      // Fallback if service not available
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
    const firebaseUid = socket.data.firebaseUid;

    this.logger.debug(
      `Receipt upsert from ${firebaseUid}: ${JSON.stringify(payload)}`,
    );

    // Delegate to MessageSocketService for persistence and broadcasting
    if (this.messageSocketService?.handleReceiptUpsert) {
      await this.messageSocketService.handleReceiptUpsert(
        socket,
        firebaseUid,
        payload,
      );
    } else {
      // Fallback if service not available
      socket.emit("message:receipt:upsert:ack", {
        messageId: payload.messageId,
        status: "received",
      });
    }
  }

  /**
   * Client signals typing state
   */
  @SubscribeMessage(SocketEvents.typingUpdate)
  handleTypingUpdate(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: TypingUpdatePayload,
  ): void {
    const firebaseUid = socket.data.firebaseUid;
    const chatId = payload.chatId;

    // Initialize typing state for chat if needed
    if (!this.typingState.has(chatId)) {
      this.typingState.set(chatId, new Map());
    }

    const typingMap = this.typingState.get(chatId)!;

    if (payload.isTyping) {
      // Record typing
      typingMap.set(firebaseUid, Date.now());
    } else {
      // Clear typing
      typingMap.delete(firebaseUid);
    }

    // Broadcast typing state to all users in chat
    const typingUsers = Array.from(typingMap.entries())
      .filter(([_, ts]) => Date.now() - ts < this.TYPING_TIMEOUT)
      .map(([userId, _]) => userId);

    // Update map to remove stale entries
    for (const [userId, ts] of typingMap.entries()) {
      if (Date.now() - ts >= this.TYPING_TIMEOUT) {
        typingMap.delete(userId);
      }
    }

    this.server.to(`chat:${chatId}`).emit(SocketEvents.typingState, {
      chatId,
      typingUserIds: typingUsers,
      updatedAt: new Date().toISOString(),
    });

    this.logger.debug(
      `Typing update in chat ${chatId}: ${typingUsers.length} users typing`,
    );
  }

  /**
   * Client queries presence of other users
   */
  @SubscribeMessage(SocketEvents.presenceQuery)
  handlePresenceQuery(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: PresenceQueryPayload,
  ): void {
    const firebaseUid = socket.data.firebaseUid;
    const userIds = payload.userIds;

    // Check which users are online
    const presenceData = userIds.map((userId) => ({
      userId,
      state: this.userConnections.has(userId) ? "online" : "offline",
      updatedAt: new Date().toISOString(),
    })) as PresenceStatePayload[];

    socket.emit(SocketEvents.presenceState, presenceData);
    this.logger.debug(
      `Presence query from ${firebaseUid}: ${userIds.length} users`,
    );
  }

  /**
   * Client joins a chat room
   * Emitted as: socket.emit("chat:join", { chatId: "..." })
   */
  @SubscribeMessage("chat:join")
  handleChatJoin(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: { chatId: string },
  ): void {
    const firebaseUid = socket.data.firebaseUid;
    const { chatId } = payload;

    this.joinChatRoom(socket, chatId);
    this.logger.log(`User ${firebaseUid} joined chat ${chatId}`);

    // Notify chat members
    this.server.to(`chat:${chatId}`).emit("chat:member_joined", {
      userId: firebaseUid,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Client leaves a chat room
   * Emitted as: socket.emit("chat:leave", { chatId: "..." })
   */
  @SubscribeMessage("chat:leave")
  handleChatLeave(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: { chatId: string },
  ): void {
    const firebaseUid = socket.data.firebaseUid;
    const { chatId } = payload;

    // Notify chat members before leaving
    this.server.to(`chat:${chatId}`).emit("chat:member_left", {
      userId: firebaseUid,
      timestamp: new Date().toISOString(),
    });

    this.leaveChatRoom(socket, chatId);
    this.logger.log(`User ${firebaseUid} left chat ${chatId}`);
  }

  /**
   * Client joins a chat room
   */
  joinChatRoom(socket: AuthenticatedSocket, chatId: string): void {
    socket.join(`chat:${chatId}`);
    this.logger.debug(`Socket ${socket.id} joined room chat:${chatId}`);
  }

  /**
   * Client leaves a chat room
   */
  leaveChatRoom(socket: AuthenticatedSocket, chatId: string): void {
    socket.leave(`chat:${chatId}`);
    this.logger.debug(`Socket ${socket.id} left room chat:${chatId}`);
  }

  /**
   * Broadcast message to chat room
   */
  broadcastMessageToChat(
    chatId: string,
    eventName: SocketEventName,
    payload: any,
  ): void {
    this.server.to(`chat:${chatId}`).emit(eventName, payload);
  }

  /**
   * Broadcast to specific user
   */
  broadcastToUser(
    firebaseUid: string,
    eventName: SocketEventName,
    payload: any,
  ): void {
    this.server.to(`user:${firebaseUid}`).emit(eventName, payload);
  }

  /**
   * Get all sockets for a user
   */
  getUserSockets(firebaseUid: string): string[] {
    return Array.from(this.userConnections.get(firebaseUid) || []);
  }

  /**
   * Check if user is online
   */
  isUserOnline(firebaseUid: string): boolean {
    const sockets = this.userConnections.get(firebaseUid);
    return sockets ? sockets.size > 0 : false;
  }
}
