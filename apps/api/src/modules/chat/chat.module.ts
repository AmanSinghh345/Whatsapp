import { Module, forwardRef } from "@nestjs/common";
import { ChatService } from "./chat.service.js";
import { ChatController } from "./chat.controller.js";
import { ChatSocketService } from "./chat-socket.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { SocketModule } from "../realtime/socket.module.js";
import { AuthModule } from "../auth/auth.module.js";

@Module({
  imports: [PrismaModule, AuthModule, forwardRef(() => SocketModule)],
  providers: [ChatService, ChatSocketService],
  controllers: [ChatController],
  exports: [ChatService, ChatSocketService],
})
export class ChatModule {}
