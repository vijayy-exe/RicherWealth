import { SetMetadata } from "@nestjs/common";

export const AUDIT_LOG_KEY = "auditLog";

export interface AuditLogMetadata {
  action: string;
  resourceType: string;
}

/**
 * @AuditLog(action, resourceType) — marks a route as writing an audit-log
 * entry on success. Enforced by the globally-registered AuditLogInterceptor
 * (apps/api/src/audit/audit-log.interceptor.ts), which is a no-op for any
 * route without this decorator — same Reflector-metadata pattern as
 * @Roles()/HouseholdRoleGuard.
 *
 * Usage:
 *   @AuditLog("VAULT_DOCUMENT_REGISTERED", "VaultDocument")
 *   @Post("register")
 *   async register(...) { ... }
 */
export const AuditLog = (action: string, resourceType: string) =>
  SetMetadata(AUDIT_LOG_KEY, { action, resourceType } satisfies AuditLogMetadata);
