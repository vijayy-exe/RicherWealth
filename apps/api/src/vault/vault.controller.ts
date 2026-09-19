import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { AuditLog } from "../audit/audit-log.decorator";
import { VaultService } from "./vault.service";
import { setupVaultSchema, requestVaultUploadSchema, registerVaultDocumentSchema } from "./dto/vault.dto";

interface AuthRequest {
  user: { id: string };
}

/**
 * Phase 16: zero-knowledge encrypted document vault. Every route here only
 * ever handles ciphertext + non-secret metadata (salt, IVs, encrypted
 * filename) — see VaultService's header comment for what is structurally
 * guaranteed never to reach this controller.
 */
@Controller("vault")
@UseGuards(SupabaseAuthGuard)
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  @Get("salt")
  async getSalt(@Request() req: AuthRequest) {
    return this.vault.getSalt(req.user.id);
  }

  @Post("setup")
  async setup(@Request() req: AuthRequest, @Body() body: unknown) {
    const dto = setupVaultSchema.parse(body);
    return this.vault.setup(req.user.id, dto);
  }

  @Get("canary")
  async getCanary(@Request() req: AuthRequest) {
    return this.vault.getCanary(req.user.id);
  }

  @Post("upload-url")
  async getUploadUrl(@Request() req: AuthRequest, @Body() body: unknown) {
    const dto = requestVaultUploadSchema.parse(body);
    return this.vault.requestUploadUrl(req.user.id, dto);
  }

  @Post("register")
  @AuditLog("VAULT_DOCUMENT_REGISTERED", "VaultDocument")
  async register(@Request() req: AuthRequest, @Body() body: unknown) {
    const dto = registerVaultDocumentSchema.parse(body);
    return this.vault.register(req.user.id, dto);
  }

  @Get()
  @AuditLog("VAULT_DOCUMENT_LIST_VIEWED", "VaultDocument")
  async list(@Request() req: AuthRequest) {
    return this.vault.findAll(req.user.id);
  }

  @Get(":id/download-url")
  @AuditLog("VAULT_DOCUMENT_DOWNLOADED", "VaultDocument")
  async getDownloadUrl(@Request() req: AuthRequest, @Param("id") id: string) {
    return this.vault.getDownloadUrl(req.user.id, id);
  }

  @Delete(":id")
  @AuditLog("VAULT_DOCUMENT_DELETED", "VaultDocument")
  async remove(@Request() req: AuthRequest, @Param("id") id: string) {
    return this.vault.remove(req.user.id, id);
  }
}
