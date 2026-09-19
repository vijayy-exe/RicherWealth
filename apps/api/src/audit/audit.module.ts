import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditService } from "./audit.service";
import { AuditLogInterceptor } from "./audit-log.interceptor";

/**
 * Phase 22: audit logging. @Global() (same pattern as ConfigModule.forRoot's
 * isGlobal:true) so AuditService can be injected into any module — vault,
 * household, estate-planning, bank-sync — without each importing this
 * module explicitly. AuditLogInterceptor is registered as an APP_INTERCEPTOR
 * so `@AuditLog(...)` works anywhere with zero per-controller wiring.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}
