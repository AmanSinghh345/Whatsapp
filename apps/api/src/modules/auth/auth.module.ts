import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { FirebaseAdminService } from "./firebase-admin.service.js";
import { FirebaseAuthGuard } from "./firebase-auth.guard.js";
import { UserModule } from "../user/user.module.js";
import { UserController } from "../user/user.controller.js";

@Module({
  imports: [UserModule],
  controllers: [AuthController, UserController],
  providers: [FirebaseAdminService, FirebaseAuthGuard],
  exports: [FirebaseAdminService, FirebaseAuthGuard, UserModule]
})
export class AuthModule {}
