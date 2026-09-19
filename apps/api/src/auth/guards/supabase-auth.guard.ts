import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";
import type { Request } from "express";

import { PrismaService } from "../../prisma/prisma.service";
import type { UserWithRelations } from "../auth.service";

/**
 * SupabaseAuthGuard — verifies the Supabase JWT in the Authorization header.
 *
 * Works for both REST (HTTP) and GraphQL resolvers.
 *
 * 1. Extracts `Bearer <token>` from the Authorization header.
 * 2. Calls Supabase `auth.getUser(token)` to validate the JWT.
 * 3. Loads the corresponding User row from Prisma via supabaseId.
 * 4. Attaches the full user to `req.user`.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  private readonly supabase;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const url = this.config.get<string>("SUPABASE_URL") ?? "";
    // Prefer the service role key (bypasses RLS); fall back to anon key for dev
    const key = (
      this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY") ||
      this.config.get<string>("SUPABASE_ANON_KEY") ||
      ""
    );
    this.supabase = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Support both REST (HTTP) and GraphQL execution contexts
    const request = this.getRequest(context);

    if (!request) {
      throw new UnauthorizedException("No request context");
    }

    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException("No auth token provided");
    }

    try {
      let supabaseUserId = "";
      let supabaseEmail = "";
      let supabaseName: string | null = null;
      let supabaseAvatar: string | null = null;

      // Phase 22: this bypass previously had NO environment gate at all —
      // any bearer token starting with "dev-" authenticated as a demo user
      // in every environment, including a hypothetical production
      // deployment. Local/dev tooling (curl, k6) still works identically;
      // only a `NODE_ENV=production` process now rejects it.
      if ((token === "dev-token" || token.startsWith("dev-")) && process.env["NODE_ENV"] !== "production") {
        supabaseUserId = "dev-supabase-user-id";
        supabaseEmail = "demo@richerwealth.app";
        supabaseName = "Demo User";
      } else {
        // Validate the JWT via Supabase — this is authoritative
        const { data, error } = await this.supabase.auth.getUser(token);
        if (error ?? !data.user) {
          throw new UnauthorizedException("Invalid or expired token");
        }
        supabaseUserId = data.user.id;
        supabaseEmail = data.user.email ?? "";
        supabaseName = (data.user.user_metadata["name"] as string | undefined) ?? null;
        supabaseAvatar = (data.user.user_metadata["avatar_url"] as string | undefined) ?? null;
      }

      // Upsert the local user row — auto-creates on first login for any auth method
      const user = await this.prisma.user.upsert({
        where: { supabaseId: supabaseUserId },
        create: {
          supabaseId: supabaseUserId,
          email: supabaseEmail,
          name: supabaseName,
          avatarUrl: supabaseAvatar,
        },
        update: {
          email: supabaseEmail,
        },
        include: {
          householdMemberships: { include: { household: true } },
        },
      });

      request.user = user as UserWithRelations;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error("Auth guard error", err);
      throw new UnauthorizedException("Authentication failed");
    }
  }

  /**
   * Extracts the underlying Express Request from either an HTTP or GraphQL context.
   */
  private getRequest(context: ExecutionContext): (Request & { user?: UserWithRelations }) | null {
    if (context.getType() === "http") {
      return context.switchToHttp().getRequest<Request & { user?: UserWithRelations }>();
    }
    // GraphQL context
    const gqlCtx = GqlExecutionContext.create(context);
    const ctx = gqlCtx.getContext<{ req?: Request & { user?: UserWithRelations } }>();
    return ctx.req ?? null;
  }

  private extractToken(request: Request): string | null {
    const auth = request.headers["authorization"];
    if (!auth?.startsWith("Bearer ")) return null;
    return auth.slice(7);
  }
}
