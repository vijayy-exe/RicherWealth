import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { StorageModule } from "../storage/storage.module";
import { VaultController } from "./vault.controller";
import { VaultService } from "./vault.service";

/**
 * Phase 16: zero-knowledge encrypted document vault. Reuses StorageModule's
 * presigned-URL mechanism (direct-to-Supabase-Storage upload, no API
 * bandwidth used) against a new private vault-documents bucket — the
 * payload it moves is client-produced AES-256-GCM ciphertext, never a
 * decryptable file. See VaultService/StorageService header comments for
 * the full architectural distinction from Phase 1/15's asset-documents and
 * tax-documents buckets.
 */
@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [VaultController],
  providers: [VaultService],
  exports: [VaultService],
})
export class VaultModule {}
