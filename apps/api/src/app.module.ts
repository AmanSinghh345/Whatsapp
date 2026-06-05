import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module.js";
import { UserModule } from "./modules/user/user.module.js";
import { PrismaModule } from "./modules/prisma/prisma.module.js";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [
     ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule, AuthModule, UserModule]
})
export class AppModule {}

