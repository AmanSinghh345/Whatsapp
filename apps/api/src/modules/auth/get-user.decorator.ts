import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequestUser } from "./firebase-auth.guard.js";

export const GetUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedRequestUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
