import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { SocketGateway } from "../realtime/socket.gateway.js";
import { MessageService } from "./message.service.js";
import type {
  MessageDto,
  SendMessageRequestDto,
  UpsertReceiptDto,
} from "@chat/shared";
import { SocketEvents } from "@chat/shared";
import type { Socket } from "socket.io";

@Injectable()
export class MessageSocketService {
  private readonly logger = new Logger(MessageSocketService.name);

  constructor(
    @Inject(forwardRef(() => SocketGateway))
    private readonly socketGateway: SocketGateway,
    private readonly messageService: MessageService,
  ) {
    // Register this service with SocketGateway
    if (this.socketGateway?.setMessageSocketService) {
      this.socketGateway.setMessageSocketService(this);
    }
  }

  /**
   * Handle incoming message from Socket.IO
   * Persist to database and broadcast to chat room
   */
  async handleMessageSend(
    socket: Socket,
    userId: string,
    payload: SendMessageRequestDto,
  ): Promise<void> {
    try {
      // Send message (persisted to database)
      const message = await this.messageService.sendMessage(userId, payload);

      // Broadcast to chat room (all members get the new message)
      this.socketGateway.broadcastMessageToChat(
        message.chatId,
        SocketEvents.messageNew,
        message,
      );

      // Send acknowledgement to sender
      socket.emit("message:send:ack", {
        clientMessageId: payload.clientMessageId,
        messageId: message.id,
        status: "sent",
      });

      this.logger.debug(
        `Message broadcast: ${message.id} to chat ${message.chatId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
      );
      socket.emit("message:send:error", {
        clientMessageId: payload.clientMessageId,
        error:
          error instanceof Error ? error.message : "Failed to send message",
      });
    }
  }

  /**
   * Handle receipt update from Socket.IO
   * Persist and broadcast to chat room
   */
  async handleReceiptUpsert(
    socket: Socket,
    userId: string,
    payload: UpsertReceiptDto,
  ): Promise<void> {
    try {
      // Update receipt in database
      await this.messageService.upsertReceipt(userId, payload);

      // Broadcast receipt update to chat room
      this.socketGateway.broadcastMessageToChat(
        payload.chatId,
        SocketEvents.messageReceiptUpdated,
        {
          messageId: payload.messageId,
          recipientId: userId,
          status: payload.status,
          updatedAt: new Date().toISOString(),
        },
      );

      // Acknowledge to sender
      socket.emit("message:receipt:upsert:ack", {
        messageId: payload.messageId,
        status: "updated",
      });

      this.logger.debug(
        `Receipt updated: ${payload.messageId} by ${userId} status=${payload.status}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update receipt: ${error instanceof Error ? error.message : String(error)}`,
      );
      socket.emit("message:receipt:upsert:error", {
        messageId: payload.messageId,
        error:
          error instanceof Error ? error.message : "Failed to update receipt",
      });
    }
  }

  /**
   * Broadcast message to chat room
   */
  broadcastMessage(chatId: string, message: MessageDto): void {
    this.socketGateway.broadcastMessageToChat(
      chatId,
      SocketEvents.messageNew,
      message,
    );
  }

  /**
   * Broadcast receipt update to chat room
   */
  broadcastReceiptUpdate(
    chatId: string,
    messageId: string,
    recipientId: string,
    status: "delivered" | "seen",
  ): void {
    this.socketGateway.broadcastMessageToChat(
      chatId,
      SocketEvents.messageReceiptUpdated,
      {
        messageId,
        recipientId,
        status,
        updatedAt: new Date().toISOString(),
      },
    );
  }
}
