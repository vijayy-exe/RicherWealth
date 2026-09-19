import { Injectable, Logger, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { HouseholdAccessService } from "../household/household-access.service";
import type { RequestVaultUploadDto, RegisterVaultDocumentDto, SetupVaultDto } from "@richer/shared-types";
import type { VaultDocumentDto, VaultSaltResponse } from "@richer/shared-types";

/**
 * Phase 16 zero-knowledge vault: CRUD + orchestration only. This service
 * NEVER imports packages/shared-types/src/vault/crypto.ts and never sees a
 * passphrase, a derived AES key, or plaintext document bytes/filenames —
 * everything it touches (file bytes at `storagePath`, `encryptedFilename`,
 * `vaultCanaryB64`) is ciphertext produced client-side. Its only job is:
 * store/serve the per-user PBKDF2 salt (not secret — safe here), hand out
 * presigned upload/download URLs against the private vault-documents
 * bucket, and CRUD the VaultDocument metadata rows.
 */
@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly householdAccess: HouseholdAccessService,
  ) {}

  async getSalt(userId: string): Promise<VaultSaltResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { vaultKeySaltB64: true, vaultCanaryB64: true },
    });
    return { saltB64: user.vaultKeySaltB64, hasCanary: user.vaultCanaryB64 !== null };
  }

  /**
   * One-time vault setup: stores the (non-secret) salt + an encrypted
   * canary. Deliberately rejects a second call — regenerating the salt
   * would derive a different key and permanently orphan every existing
   * VaultDocument (their ciphertext can never be decrypted again). This is
   * the same "true zero-knowledge means no server-side recovery" tradeoff
   * documented in the frontend setup screen's warning copy.
   */
  async setup(userId: string, dto: SetupVaultDto): Promise<VaultSaltResponse> {
    const existing = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { vaultKeySaltB64: true },
    });
    if (existing.vaultKeySaltB64) {
      throw new ConflictException("Vault is already set up for this user — the salt cannot be regenerated without permanently orphaning existing documents.");
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        vaultKeySaltB64: dto.saltB64,
        vaultCanaryB64: dto.canaryB64,
        vaultCanaryIvB64: dto.canaryIvB64,
        vaultSetupAt: new Date(),
      },
      select: { vaultKeySaltB64: true, vaultCanaryB64: true },
    });

    this.logger.log(`Vault set up for user ${userId} (salt stored, canary stored — no passphrase or key ever reached this service).`);
    return { saltB64: updated.vaultKeySaltB64, hasCanary: updated.vaultCanaryB64 !== null };
  }

  /** For the "unlock vault" screen's client-side passphrase check — never decrypted here. */
  async getCanary(userId: string): Promise<{ canaryB64: string; canaryIvB64: string } | null> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { vaultCanaryB64: true, vaultCanaryIvB64: true },
    });
    if (!user.vaultCanaryB64 || !user.vaultCanaryIvB64) return null;
    return { canaryB64: user.vaultCanaryB64, canaryIvB64: user.vaultCanaryIvB64 };
  }

  async requestUploadUrl(userId: string, _dto: RequestVaultUploadDto): Promise<{ uploadUrl: string; path: string; token: string }> {
    return this.storage.getVaultUploadUrl(userId);
  }

  async register(userId: string, dto: RegisterVaultDocumentDto): Promise<VaultDocumentDto> {
    if (dto.linkedAssetId) {
      const owned = await this.prisma.asset.findFirst({ where: { id: dto.linkedAssetId, userId, deletedAt: null } });
      if (!owned) throw new NotFoundException("Linked asset not found or not owned by this user.");
    }
    if (dto.linkedHouseholdId) {
      // Phase 21: a WILL_TRUST document links to a Household, not an Asset —
      // any member may attach one (an OWNER isn't required, mirroring how
      // linkedAssetId only checks ownership, not an edit-permission level).
      const householdIds = await this.householdAccess.householdIdsFor(userId);
      if (!householdIds.includes(dto.linkedHouseholdId)) {
        throw new NotFoundException("Linked household not found or you are not a member.");
      }
    }

    const doc = await this.prisma.vaultDocument.create({
      data: {
        userId,
        category: dto.category,
        storagePath: dto.storagePath,
        encryptedFilename: dto.encryptedFilename,
        encryptedFilenameIv: dto.encryptedFilenameIv,
        mimeType: dto.mimeType,
        fileSizeBytes: dto.fileSizeBytes,
        iv: dto.iv,
        linkedAssetId: dto.linkedAssetId ?? null,
        linkedHouseholdId: dto.linkedHouseholdId ?? null,
      },
    });

    this.logger.log(`Vault document ${doc.id} registered for user ${userId} (category ${dto.category}, ${dto.fileSizeBytes} bytes ciphertext) — filename/content never seen by this service.`);
    return this.toDto(doc);
  }

  async findAll(userId: string): Promise<VaultDocumentDto[]> {
    const docs = await this.prisma.vaultDocument.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return docs.map((d) => this.toDto(d));
  }

  async getDownloadUrl(userId: string, id: string): Promise<{ downloadUrl: string; encryptedFilename: string; encryptedFilenameIv: string; iv: string; mimeType: string }> {
    const doc = await this.prisma.vaultDocument.findFirst({ where: { id, userId } });
    if (!doc) throw new NotFoundException("Vault document not found.");

    const downloadUrl = await this.storage.getVaultDownloadUrl(doc.storagePath);
    return { downloadUrl, encryptedFilename: doc.encryptedFilename, encryptedFilenameIv: doc.encryptedFilenameIv, iv: doc.iv, mimeType: doc.mimeType };
  }

  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    const doc = await this.prisma.vaultDocument.findFirst({ where: { id, userId } });
    if (!doc) throw new NotFoundException("Vault document not found.");

    await this.storage.deleteVaultDocument(doc.storagePath);
    await this.prisma.vaultDocument.delete({ where: { id } });
    return { deleted: true };
  }

  private toDto(doc: {
    id: string; category: string; storagePath: string; encryptedFilename: string; encryptedFilenameIv: string;
    mimeType: string; fileSizeBytes: number; iv: string; linkedAssetId: string | null;
    linkedHouseholdId: string | null; createdAt: Date;
  }): VaultDocumentDto {
    return {
      id: doc.id,
      category: doc.category as VaultDocumentDto["category"],
      storagePath: doc.storagePath,
      encryptedFilename: doc.encryptedFilename,
      encryptedFilenameIv: doc.encryptedFilenameIv,
      mimeType: doc.mimeType,
      fileSizeBytes: doc.fileSizeBytes,
      linkedHouseholdId: doc.linkedHouseholdId,
      iv: doc.iv,
      linkedAssetId: doc.linkedAssetId,
      createdAt: doc.createdAt.toISOString(),
    };
  }
}
