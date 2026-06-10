import { Module } from "@nestjs/common";
import { SocketGateway } from "./socket.gateway.js";
import { SocketAuthGuard } from "./socket-auth.guard.js";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { PresenceService } from "./presence.service.js";

@Module({
  imports: [AuthModule, PrismaModule],
  providers: [SocketGateway, SocketAuthGuard, PresenceService],
  exports: [SocketGateway, SocketAuthGuard],
})
export class SocketModule {}
