import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { Prisma } from "@prisma/client";

export interface AuditLogInput {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * Phase 22: immutable audit trail (see AuditLog model comment in
 * schema.prisma for the DB-level immutability guarantee). This service is
 * INSERT-only by design — no update/delete method exists here, and none
 * should ever be added.
 *
 * A failed audit write must never break the request it's observing (an
 * outage in this table shouldn't take down vault uploads or asset edits),
 * so `log()` swallows its own errors after logging them — same
 * fail-open-but-loud philosophy every price-sync provider in this codebase
 * already uses for its own non-critical failures.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          ipAddress: input.ipAddress ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log (${input.action}/${input.resourceType}): ${String(err)}`);
    }
  }
}
