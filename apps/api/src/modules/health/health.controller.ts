import { Controller, Get, UseGuards } from "@nestjs/common";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard.js";
import type { AuthenticatedRequestUser } from "../auth/firebase-auth.guard.js";
import { GetUser } from "../auth/get-user.decorator.js";

@Controller("health")
export class HealthController {
  /**
   * Health check endpoint
   */
  @Get()
  health() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Authentication check - returns current user
   */
  @UseGuards(FirebaseAuthGuard)
  @Get("me")
  getCurrentUser(@GetUser() user: AuthenticatedRequestUser) {
    return {
      user,
      authenticated: true,
    };
  }
}
