import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module.js";
import { UserModule } from "./modules/user/user.module.js";
import { PrismaModule } from "./modules/prisma/prisma.module.js";
import { ConfigModule } from "@nestjs/config";
import { ChatModule } from "./modules/chat/chat.module.js";
import { MessageModule } from "./modules/message/message.module.js";
import { SocketModule } from "./modules/realtime/socket.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { MediaModule } from "./modules/media/media.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UserModule,
    ChatModule,
    MessageModule,
    MediaModule,
    SocketModule,
    HealthModule,
  ],
})
export class AppModule {}
