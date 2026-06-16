import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ChatModule } from "../chat/chat.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { SocketModule } from "../realtime/socket.module.js";
import { CallController } from "./call.controller.js";
import { CallService } from "./call.service.js";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ChatModule,
    SocketModule,
  ],
  controllers: [CallController],
  providers: [CallService],
})
export class CallModule {}
