import { Module, forwardRef } from "@nestjs/common";
import { MessageService } from "./message.service.js";
import { MessageController } from "./message.controller.js";
import { MessageSocketService } from "./message-socket.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { ChatModule } from "../chat/chat.module.js";
import { SocketModule } from "../realtime/socket.module.js";
import { AuthModule } from "../auth/auth.module.js";

@Module({
  imports: [PrismaModule, AuthModule, ChatModule, forwardRef(() => SocketModule)],
  providers: [MessageService, MessageSocketService],
  controllers: [MessageController],
  exports: [MessageService, MessageSocketService],
})
export class MessageModule {}
