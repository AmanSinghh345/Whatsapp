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
} from "@chat/shared";

@Injectable()
export class CallService {
  private readonly logger = new Logger(CallService.name);

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

    const updated = await this.prisma.callSession.update({
      where: { id: callId },
      data: {
        status: "ended",
        endedAt: new Date(),
      },
    });
    const dto = this.toCallDto(updated);

    this.broadcastCallState(dto);
    return dto;
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
}
