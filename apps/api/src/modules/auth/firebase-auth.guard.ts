import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { FirebaseAdminService } from "./firebase-admin.service.js";

export type AuthenticatedRequestUser = {
  firebaseUid: string;
  email?: string;
  phoneE164?: string;
  displayName?: string;
  avatarUrl?: string;
};

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthenticatedRequestUser;
    }>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing Bearer token");
    }

    const idToken = authHeader.slice("Bearer ".length).trim();
    const decoded = await this.firebaseAdminService.verifyIdToken(idToken);
    const user: AuthenticatedRequestUser = { firebaseUid: decoded.uid };
    if (typeof decoded.email === "string") {
      user.email = decoded.email;
    }
    if (typeof decoded.phone_number === "string") {
      user.phoneE164 = decoded.phone_number;
    }
    if (typeof decoded.name === "string") {
      user.displayName = decoded.name;
    }
    if (typeof decoded.picture === "string") {
      user.avatarUrl = decoded.picture;
    }
    request.user = user;
    return true;
  }
}

