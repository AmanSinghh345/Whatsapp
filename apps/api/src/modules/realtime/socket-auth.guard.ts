import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { FirebaseAdminService } from "../auth/firebase-admin.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

export type SocketAuthenticatedUser = {
  firebaseUid: string;
  dbUserId: string;        // ← add this
  email?: string;
  phoneE164?: string;
  displayName?: string;
  avatarUrl?: string;
};

@Injectable()
export class SocketAuthGuard implements CanActivate {
  private readonly logger = new Logger(SocketAuthGuard.name);

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly prisma: PrismaService,   // ← add this
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const socket = context.switchToWs().getClient();
      const authHeader =
        socket.handshake?.auth?.token ||
        socket.handshake?.headers?.authorization;

      if (!authHeader) {
        throw new UnauthorizedException("Missing authentication token");
      }

      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : authHeader;

      if (!token) {
        throw new UnauthorizedException("Invalid token format");
      }

      const decoded = await this.firebaseAdminService.verifyIdToken(token);

      // ← look up DB user by firebaseUid
      const dbUser = await this.prisma.user.findUnique({
        where: { firebaseUid: decoded.uid },
        select: { id: true },
      });

      if (!dbUser) {
        throw new UnauthorizedException("User not found in database");
      }

      const user: SocketAuthenticatedUser = {
        firebaseUid: decoded.uid,
        dbUserId: dbUser.id,     // ← attach DB id
      };

      if (typeof decoded.email === "string") user.email = decoded.email;
      if (typeof decoded.phone_number === "string") user.phoneE164 = decoded.phone_number;
      if (typeof decoded.name === "string") user.displayName = decoded.name;
      if (typeof decoded.picture === "string") user.avatarUrl = decoded.picture;

      socket.data.user = user;
      socket.data.firebaseUid = user.firebaseUid;
      socket.data.userId = user.dbUserId;   // ← attach to socket.data directly

      return true;
    } catch (error) {
      this.logger.error(
        `Socket auth failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}