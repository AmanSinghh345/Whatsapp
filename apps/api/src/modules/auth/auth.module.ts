import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { FirebaseAdminService } from "./firebase-admin.service.js";
import { FirebaseAuthGuard } from "./firebase-auth.guard.js";
import { UserModule } from "../user/user.module.js";

@Module({
  imports: [UserModule],
  controllers: [AuthController],
  providers: [FirebaseAdminService, FirebaseAuthGuard],
  exports: [FirebaseAdminService, FirebaseAuthGuard]
})
export class AuthModule {}

