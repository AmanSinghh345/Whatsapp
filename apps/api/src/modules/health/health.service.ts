import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  getApiHealth() {
    return {
      status: "ok",
      service: "whatsapp-api",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV ?? "development",
    };
  }

  async getDbHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: "ok",
        db: "connected",
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: "error",
        db: "disconnected",
        timestamp: new Date().toISOString(),
        message: "Database health check failed",
      });
    }
  }

  getSocketHealth() {
    return {
      status: "ok",
      service: "socket-server",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
