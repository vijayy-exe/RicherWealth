import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, tap } from "rxjs";
import { AuditService } from "./audit.service";
import { AUDIT_LOG_KEY, type AuditLogMetadata } from "./audit-log.decorator";

interface AuditableRequest {
  user?: { id: string };
  params?: Record<string, string>;
  ip?: string;
}

/**
 * Registered globally (see AuditModule) so any route anywhere can opt in
 * with just `@AuditLog(action, resourceType)` — no per-controller
 * `@UseInterceptors` boilerplate. A no-op for the (overwhelming majority
 * of) routes without that decorator.
 *
 * Logs only after the handler completes successfully — a thrown exception
 * (e.g. a 403 from HouseholdAccessService) means the action never actually
 * happened, so nothing is recorded for it.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditLogMetadata | undefined>(AUDIT_LOG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return next.handle();

    const request = context.switchToHttp().getRequest<AuditableRequest>();
    const actorId = request.user?.id;
    // Most routes use :id; a few (e.g. household membership routes) use a
    // differently-named param — fall back to the first route param present.
    const params = request.params ?? {};
    const resourceId = params["id"] ?? Object.values(params)[0] ?? null;

    return next.handle().pipe(
      tap(() => {
        if (!actorId) return;
        void this.audit
          .log({
            actorId,
            action: meta.action,
            resourceType: meta.resourceType,
            resourceId,
            ipAddress: request.ip ?? null,
          })
          .catch((err: unknown) => this.logger.error(`Audit interceptor failed: ${String(err)}`));
      }),
    );
  }
}
