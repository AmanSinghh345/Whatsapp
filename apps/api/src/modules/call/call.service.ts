import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { ChatService } from "../chat/chat.service.js";
import { SocketGateway } from "../realtime/socket.gateway.js";
import { SocketEvents } from "@chat/shared";
import type {
  CallSessionDto,
  ChatDto,
  CreateCallRequestDto,
  MessageDto,
} from "@chat/shared";

const MISSED_CALL_TIMEOUT_MS = 45_000;

@Injectable()
export class CallService {
  private readonly logger = new Logger(CallService.name);
  private readonly missedCallTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly socketGateway: SocketGateway,
  ) {}

  async createCall(
    userId: string,
    request: CreateCallRequestDto,
  ): Promise<{ call: CallSessionDto; chat: ChatDto }> {
    const chat = await this.chatService.getChat(request.chatId, userId);
    const receiverId = this.resolveReceiverId(chat, userId, request.receiverId);

    const call = await this.prisma.callSession.create({
      data: {
        chatId: chat.id,
        initiatorId: userId,
        receiverId,
        status: "ringing",
      },
    });
    const dto = this.toCallDto(call);
    this.scheduleMissedCall(call.id);

    this.socketGateway.broadcastToUser(receiverId, SocketEvents.callCreated, {
      call: dto,
      chat,
    });
    this.socketGateway.broadcastToUser(userId, SocketEvents.callState, {
      call: dto,
    });

    this.logger.log(
      `Call created: ${call.id} chat=${chat.id} initiator=${userId} receiver=${receiverId}`,
    );

    return { call: dto, chat };
  }

  async answerCall(userId: string, callId: string): Promise<CallSessionDto> {
    const call = await this.getParticipantCall(callId, userId);

    if (call.status === "ended" || call.status === "missed") {
      throw new BadRequestException("Call has already ended");
    }

    this.clearMissedCallTimer(callId);

    const updated = await this.prisma.callSession.update({
      where: { id: callId },
      data: {
        status: "active",
        startedAt: call.startedAt ?? new Date(),
      },
    });
    const dto = this.toCallDto(updated);

    this.broadcastCallState(dto);
    return dto;
  }

  async endCall(userId: string, callId: string): Promise<CallSessionDto> {
    const call = await this.getParticipantCall(callId, userId);

    if (call.status === "ended" || call.status === "missed") {
      const dto = this.toCallDto(call);
      this.broadcastCallState(dto);
      return dto;
    }

    this.clearMissedCallTimer(callId);

    const nextStatus =
      call.status === "ringing" && userId === call.receiverId
        ? "missed"
        : "ended";
    const updated = await this.prisma.callSession.update({
      where: { id: callId },
      data: {
        status: nextStatus,
        endedAt: new Date(),
      },
    });
    const dto = this.toCallDto(updated);

    this.broadcastCallState(dto);
    await this.createCallHistoryMessage(dto);
    return dto;
  }

  private scheduleMissedCall(callId: string): void {
    this.clearMissedCallTimer(callId);

    const timeout = setTimeout(() => {
      void this.markCallMissed(callId).catch((error) => {
        this.logger.warn(
          `Failed to mark call ${callId} missed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }, MISSED_CALL_TIMEOUT_MS);

    timeout.unref?.();
    this.missedCallTimers.set(callId, timeout);
  }

  private clearMissedCallTimer(callId: string): void {
    const timeout = this.missedCallTimers.get(callId);

    if (timeout) {
      clearTimeout(timeout);
      this.missedCallTimers.delete(callId);
    }
  }

  private async markCallMissed(callId: string): Promise<void> {
    this.clearMissedCallTimer(callId);

    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
    });

    if (!call || call.status !== "ringing") {
      return;
    }

    const updated = await this.prisma.callSession.update({
      where: { id: callId },
      data: {
        status: "missed",
        endedAt: new Date(),
      },
    });
    const dto = this.toCallDto(updated);

    this.broadcastCallState(dto);
    await this.createCallHistoryMessage(dto);
  }

  private resolveReceiverId(
    chat: ChatDto,
    userId: string,
    requestedReceiverId?: string,
  ): string {
    const memberIds = chat.members?.map((member) => member.userId) ?? [];
    const receiverId =
      requestedReceiverId ??
      memberIds.find((memberUserId) => memberUserId !== userId);

    if (!receiverId) {
      throw new BadRequestException("Call receiver is required");
    }

    if (receiverId === userId) {
      throw new BadRequestException("Cannot call yourself");
    }

    if (!memberIds.includes(receiverId)) {
      throw new ForbiddenException("Receiver is not a member of this chat");
    }

    return receiverId;
  }

  private async getParticipantCall(callId: string, userId: string) {
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
    });

    if (!call) {
      throw new NotFoundException(`Call ${callId} not found`);
    }

    if (call.initiatorId !== userId && call.receiverId !== userId) {
      throw new ForbiddenException("You are not a participant in this call");
    }

    return call;
  }

  private broadcastCallState(call: CallSessionDto): void {
    this.socketGateway.broadcastToUser(call.createdById, SocketEvents.callState, {
      call,
    });
    this.socketGateway.broadcastToUser(call.receiverId, SocketEvents.callState, {
      call,
    });
    this.socketGateway.broadcastToCall(call.id, SocketEvents.callState, { call });
  }

  private async createCallHistoryMessage(
    call: CallSessionDto,
  ): Promise<MessageDto | null> {
    if (!call.chatId) {
      return null;
    }

    const text = this.getCallHistoryText(call);
    const message = await this.prisma.message.create({
      data: {
        chatId: call.chatId,
        senderId: call.createdById,
        clientMessageId: `call:${call.id}:${call.status}`,
        contentType: "system",
        textContent: text,
      },
      include: { attachments: true, receipts: true, reactions: true },
    });
    await this.prisma.chat.update({
      where: { id: call.chatId },
      data: { updatedAt: message.createdAt },
    });

    const chatMembers = await this.prisma.chatMember.findMany({
      where: { chatId: call.chatId, userId: { not: call.createdById } },
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
    const dto = this.toMessageDto(messageWithReceipts ?? message);

    this.socketGateway.broadcastMessageToChat(
      call.chatId,
      SocketEvents.messageNew,
      dto,
    );

    return dto;
  }

  private getCallHistoryText(call: CallSessionDto): string {
    if (call.status === "missed") {
      return "Missed video call";
    }

    if (!call.startedAt) {
      return "Video call canceled";
    }

    return `Video call ended - ${this.formatCallDuration(
      call.startedAt,
      call.endedAt,
    )}`;
  }

  private formatCallDuration(startedAt: string, endedAt?: string): string {
    const start = new Date(startedAt).getTime();
    const end = endedAt ? new Date(endedAt).getTime() : Date.now();
    const totalSeconds = Math.max(0, Math.round((end - start) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  private toCallDto(call: any): CallSessionDto {
    return {
      id: call.id,
      ...(call.chatId ? { chatId: call.chatId } : {}),
      createdById: call.initiatorId,
      receiverId: call.receiverId,
      status: call.status,
      createdAt: call.createdAt.toISOString(),
      ...(call.startedAt ? { startedAt: call.startedAt.toISOString() } : {}),
      ...(call.endedAt ? { endedAt: call.endedAt.toISOString() } : {}),
    };
  }

  private toMessageDto(message: any): MessageDto {
    return {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      clientMessageId: message.clientMessageId,
      contentType: message.contentType,
      text: message.textContent,
      attachments: message.attachments?.map((attachment: any) => ({
        id: attachment.id,
        url: attachment.url,
        cloudinaryPublicId: attachment.cloudinaryPublicId,
        resourceType: attachment.resourceType,
        mimeType: attachment.mimeType,
        bytes: attachment.bytes,
        width: attachment.width,
        height: attachment.height,
      })),
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
    };
  }

  private getReceiptStatus(receipts: any[]): "sent" | "delivered" | "seen" {
    if (receipts.some((receipt) => Boolean(receipt.seenAt))) {
      return "seen";
    }

    if (
      receipts.length > 0 &&
      receipts.every((receipt) => Boolean(receipt.deliveredAt))
    ) {
      return "delivered";
    }

    return "sent";
  }
}
