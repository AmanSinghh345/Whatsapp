import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { SocketGateway } from "../realtime/socket.gateway.js";
import { ChatService } from "./chat.service.js";
import type { SocketEventName } from "@chat/shared";
import type { Socket } from "socket.io";

@Injectable()
export class ChatSocketService {
  private readonly logger = new Logger(ChatSocketService.name);

  constructor(
    @Inject(forwardRef(() => SocketGateway))
    private readonly socketGateway: SocketGateway,
    private readonly chatService: ChatService,
  ) {}

  /**
   * Allow user to join a chat room via Socket.IO
   * Validates they are a member of the chat first
   */
  async joinChatRoom(
    socket: Socket,
    chatId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      // Verify user is member of chat
      await this.chatService.getChat(chatId, userId);

      // Join the room
      this.socketGateway.joinChatRoom(socket, chatId);
      this.logger.log(`User ${userId} joined chat room ${chatId}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to join chat room: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Allow user to leave a chat room
   */
  async leaveChatRoom(
    socket: Socket,
    chatId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      this.socketGateway.leaveChatRoom(socket, chatId);
      this.logger.log(`User ${userId} left chat room ${chatId}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to leave chat room: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Broadcast a message to all users in a chat room
   */
  broadcastToChat(chatId: string, eventName: SocketEventName, payload: any): void {
    this.socketGateway.broadcastMessageToChat(chatId, eventName, payload);
  }

  /**
   * Broadcast to a specific user
   */
  broadcastToUser(userId: string, eventName: SocketEventName, payload: any): void {
    this.socketGateway.broadcastToUser(userId, eventName, payload);
  }
}
