import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import type { UserWithRelations } from "../auth.service";

/**
 * @CurrentUser() decorator — injects the authenticated user into a controller method.
 * The user is attached to req.user by SupabaseAuthGuard.
 *
 * Usage:
 *   async getMe(@CurrentUser() user: UserWithRelations) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserWithRelations => {
    const request = ctx.switchToHttp().getRequest<Request & { user: UserWithRelations }>();
    return request.user;
  },
);
