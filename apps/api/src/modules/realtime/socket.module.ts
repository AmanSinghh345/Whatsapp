import { Module } from "@nestjs/common";
import { SocketGateway } from "./socket.gateway.js";
import { SocketAuthGuard } from "./socket-auth.guard.js";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";  // ← add

@Module({
  imports: [AuthModule, PrismaModule],   // ← add PrismaModule
  providers: [SocketGateway, SocketAuthGuard],
  exports: [SocketGateway, SocketAuthGuard],
})
export class SocketModule {}