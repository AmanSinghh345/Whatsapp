import { Module } from "@nestjs/common";
import { SocketGateway } from "./socket.gateway.js";
import { SocketAuthGuard } from "./socket-auth.guard.js";
import { AuthModule } from "../auth/auth.module.js";

@Module({
  imports: [AuthModule],
  providers: [SocketGateway, SocketAuthGuard],
  exports: [SocketGateway, SocketAuthGuard],
})
export class SocketModule {}
