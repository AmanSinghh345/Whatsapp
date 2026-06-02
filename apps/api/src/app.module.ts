import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module.js";
import { UserModule } from "./modules/user/user.module.js";
import { PrismaModule } from "./modules/prisma/prisma.module.js";

@Module({
  imports: [PrismaModule, AuthModule, UserModule]
})
export class AppModule {}

