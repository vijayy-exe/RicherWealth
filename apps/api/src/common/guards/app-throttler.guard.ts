import { Injectable, ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { GqlExecutionContext } from "@nestjs/graphql";
import type { Request, Response } from "express";

/**
 * Phase 22: `@nestjs/throttler`'s default `getRequestResponse` assumes an
 * HTTP context (`context.switchToHttp()`), which returns `undefined` for
 * this app's one GraphQL query (`dashboardSummary`) — a real bug found
 * live (the throttler guard crashed with "Cannot read properties of
 * undefined (reading 'ip')" the moment ThrottlerModule was registered
 * globally, taking down the entire Dashboard page). Same
 * `GqlExecutionContext` pattern `SupabaseAuthGuard.getRequest()` already
 * uses for the same reason.
 *
 * `getTracker` is also overridden: the default keys purely by IP, which a
 * k6 load test surfaced as a real fairness bug — every authenticated
 * request from behind the same IP/NAT (a household on one wifi network, or
 * this load test's own concurrent virtual users) shares one bucket and
 * throttles each other, not each real user. Keyed instead by the bearer
 * token's own `sub` claim when present. This guard is registered globally
 * and therefore runs BEFORE any per-controller `SupabaseAuthGuard`
 * (Nest's documented guard order: global, then controller, then handler)
 * — `req.user` genuinely isn't populated yet at this point, confirmed by
 * reading Nest's own execution order, not assumed. Decoding the JWT
 * payload here (no signature verification — this is a rate-limit bucket
 * key, not an authorization decision; real verification still happens
 * downstream in SupabaseAuthGuard exactly as before) sidesteps that
 * ordering constraint entirely rather than fighting it.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override getRequestResponse(context: ExecutionContext): { req: Request; res: Response } {
    if (context.getType() === "http") {
      const http = context.switchToHttp();
      return { req: http.getRequest<Request>(), res: http.getResponse<Response>() };
    }
    const gqlCtx = GqlExecutionContext.create(context);
    const ctx = gqlCtx.getContext<{ req: Request; res?: Response }>();
    return { req: ctx.req, res: ctx.res as Response };
  }

  protected override async getTracker(req: Request): Promise<string> {
    const auth = req.headers?.["authorization"];
    if (typeof auth === "string" && auth.startsWith("Bearer ")) {
      const token = auth.slice(7);
      if (token === "dev-token" || token.startsWith("dev-")) return `user:${token}`;
      const subject = decodeJwtSubjectUnverified(token);
      if (subject) return `user:${subject}`;
    }
    return super.getTracker(req);
  }
}

/** Decodes a JWT's `sub` claim without verifying the signature — safe
 * ONLY as a rate-limit bucket key, never for authorization. */
function decodeJwtSubjectUnverified(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { sub?: unknown };
    return typeof parsed.sub === "string" ? parsed.sub : null;
  } catch {
    return null;
  }
}
