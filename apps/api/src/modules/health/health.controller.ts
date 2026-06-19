import { Controller, Get, NotFoundException, UseGuards } from "@nestjs/common";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard.js";
import type { AuthenticatedRequestUser } from "../auth/firebase-auth.guard.js";
import { GetUser } from "../auth/get-user.decorator.js";
import { HealthService } from "./health.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Health check endpoint
   */
  @Get()
  health() {
    return this.healthService.getApiHealth();
  }

  @Get("db")
  db() {
    return this.healthService.getDbHealth();
  }

  @Get("socket")
  socket() {
    return this.healthService.getSocketHealth();
  }

  @Get("sentry-test")
  sentryTest() {
    const isDevelopment =
      process.env.NODE_ENV === "development" ||
      process.env.SENTRY_ENVIRONMENT === "development";

    if (!isDevelopment) {
      throw new NotFoundException();
    }

    throw new Error("Sentry backend test error");
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
