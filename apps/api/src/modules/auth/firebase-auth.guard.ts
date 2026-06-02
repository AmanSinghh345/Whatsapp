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
    request.user = {
      firebaseUid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : undefined,
      phoneE164: typeof decoded.phone_number === "string" ? decoded.phone_number : undefined,
      displayName: typeof decoded.name === "string" ? decoded.name : undefined,
      avatarUrl: typeof decoded.picture === "string" ? decoded.picture : undefined
    };
    return true;
  }
}

