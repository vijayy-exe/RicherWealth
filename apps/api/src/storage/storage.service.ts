import { Injectable, Logger, InternalServerErrorException, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const BUCKET = "asset-documents";
/// Separate, private bucket for ITR/tax documents (Phase 15 ITR extension) —
/// kept apart from asset-documents because these files carry PII (PAN,
/// income figures) with a stricter "never logged in plaintext" handling
/// rule (see ItrExtractionService). Both buckets get Supabase-managed
/// at-rest encryption identically; this separation is about access-path
/// hygiene (a future stricter RLS policy on tax-documents specifically),
/// not a stronger encryption guarantee on this bucket vs. the other.
const TAX_BUCKET = "tax-documents";
/// Phase 16 zero-knowledge vault bucket. ARCHITECTURALLY DIFFERENT from the
/// two buckets above, not just access-path hygiene: asset-documents and
/// tax-documents receive PLAINTEXT file bytes from the client (this API
/// server sees the content in transit, Supabase Storage sees it at rest —
/// Supabase-managed at-rest encryption only). vault-documents receives ONLY
/// AES-256-GCM ciphertext the browser produced BEFORE calling this service
/// at all (see packages/shared-types/src/vault/crypto.ts,
/// apps/web/src/hooks/useVault.ts) — this API process and Supabase Storage
/// never see plaintext content for anything in this bucket. Nothing in
/// apps/api imports the vault crypto module; this service only ever moves
/// bytes it cannot itself decrypt.
const VAULT_BUCKET = "vault-documents";
const SIGNED_URL_TTL_SECONDS = 3600; // 1 hour

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly supabase;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>("SUPABASE_URL") ?? "";
    const key = this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    this.supabase = createClient(url, key, { auth: { persistSession: false } });
  }

  /**
   * Ensures the private tax-documents bucket exists — there's no
   * infra/migration script anywhere in this repo that provisions Supabase
   * Storage buckets (confirmed by grep; asset-documents was presumably
   * created by hand in the dashboard at some earlier point, which is why
   * this repo had never actually exercised its own getUploadUrl before
   * this phase). Idempotent (checked, not blindly created every boot) and
   * non-fatal if it fails (e.g. the service-role key lacks bucket-admin
   * rights) — surfaced as a clear warning rather than crashing the app,
   * matching this repo's fallback-over-crash convention elsewhere.
   */
  async onModuleInit(): Promise<void> {
    await this.ensureBucket(TAX_BUCKET, "10MB", ["application/pdf", "image/jpeg", "image/png"]);
    // Vault bucket has no allowedMimeTypes restriction: it stores ciphertext
    // (application/octet-stream in effect), never the document's real
    // mimeType — Supabase can't and shouldn't type-check bytes it can't read.
    await this.ensureBucket(VAULT_BUCKET, "25MB", undefined);
  }

  /**
   * Idempotent bucket provisioning, shared by every private bucket this
   * service owns. Non-fatal if it fails (e.g. the service-role key lacks
   * bucket-admin rights) — logs a clear warning instead of crashing the
   * app, matching this repo's fallback-over-crash convention elsewhere.
   */
  private async ensureBucket(name: string, fileSizeLimit: string, allowedMimeTypes: string[] | undefined): Promise<void> {
    try {
      const { data: buckets, error: listError } = await this.supabase.storage.listBuckets();
      if (listError) {
        this.logger.warn(`Could not list Supabase Storage buckets (${listError.message}) — skipping "${name}" bucket check.`);
        return;
      }
      if (buckets?.some((b) => b.name === name)) return;

      const { error: createError } = await this.supabase.storage.createBucket(name, {
        public: false,
        fileSizeLimit,
        ...(allowedMimeTypes ? { allowedMimeTypes } : {}),
      });
      if (createError) {
        this.logger.warn(`Could not create "${name}" bucket automatically (${createError.message}) — create it manually in the Supabase dashboard (private, ${fileSizeLimit} limit${allowedMimeTypes ? `, ${allowedMimeTypes.join("/")} only` : ""}).`);
        return;
      }
      this.logger.log(`Created private Supabase Storage bucket "${name}".`);
    } catch (err) {
      this.logger.warn(`"${name}" bucket check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Returns a presigned upload URL + the storage path.
   * Path pattern: {userId}/{assetId}/{filename}
   * Client uploads directly to Supabase Storage (no API server bandwidth used).
   */
  async getUploadUrl(
    userId: string,
    assetId: string,
    filename: string,
    mimeType: string,
  ): Promise<{ uploadUrl: string; path: string }> {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/${assetId}/${Date.now()}_${safeName}`;

    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      this.logger.error("Failed to create signed upload URL", error);
      throw new InternalServerErrorException("Could not generate upload URL");
    }

    return { uploadUrl: data.signedUrl, path };
  }

  /**
   * Same contract as getUploadUrl but against the private tax-documents
   * bucket, path pattern {userId}/itr/{filename} — used by ItrDocument
   * uploads. mimeType is accepted for interface symmetry with getUploadUrl
   * (Supabase's createSignedUploadUrl doesn't take it directly; the actual
   * client-side upload call passes contentType).
   */
  async getTaxDocumentUploadUrl(
    userId: string,
    filename: string,
    _mimeType: string,
  ): Promise<{ uploadUrl: string; path: string; token: string }> {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/itr/${Date.now()}_${safeName}`;

    const { data, error } = await this.supabase.storage
      .from(TAX_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      this.logger.error("Failed to create signed tax-document upload URL", error);
      throw new InternalServerErrorException("Could not generate upload URL");
    }

    // The client uses uploadToSignedUrl(path, token, file) via the Supabase
    // JS SDK, not a raw PUT to signedUrl — token is required for that call.
    return { uploadUrl: data.signedUrl, path, token: data.token };
  }

  /**
   * Returns a signed download URL for a stored file.
   */
  async getDownloadUrl(path: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (error || !data) {
      throw new InternalServerErrorException("Could not generate download URL");
    }
    return data.signedUrl;
  }

  async getTaxDocumentDownloadUrl(path: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(TAX_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (error || !data) {
      throw new InternalServerErrorException("Could not generate download URL");
    }
    return data.signedUrl;
  }

  /**
   * Downloads a tax document's raw bytes server-side for extraction
   * (OCR/PDF-text parsing happens in the API process, not the browser).
   * Never logs file content — only the byte length, matching the
   * never-log-PII rule documented on ItrExtractionService.
   */
  async downloadTaxDocument(path: string): Promise<Buffer> {
    const { data, error } = await this.supabase.storage.from(TAX_BUCKET).download(path);
    if (error || !data) {
      this.logger.error(`Failed to download tax document at path ${path}`, error);
      throw new InternalServerErrorException("Could not download tax document");
    }
    return Buffer.from(await data.arrayBuffer());
  }

  /**
   * Deletes a file from storage.
   */
  async deleteFile(path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(BUCKET).remove([path]);
    if (error) {
      this.logger.error(`Failed to delete file ${path}`, error);
    }
  }

  async deleteTaxDocument(path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(TAX_BUCKET).remove([path]);
    if (error) {
      this.logger.error(`Failed to delete tax document ${path}`, error);
    }
  }

  /**
   * Signed upload URL against the private vault-documents bucket.
   * Path pattern: {userId}/{randomId} — DELIBERATELY not
   * {userId}/vault/{timestamp}_{originalFilename} like the other two
   * buckets use. The original filename is PII-bearing on its own (e.g.
   * "Aadhaar_1234.pdf") and must not appear anywhere server-visible,
   * including the storage path — it travels only as client-side
   * AES-GCM ciphertext (VaultDocument.encryptedFilename), decrypted in
   * the browser for display. randomUUID() (Node's built-in `crypto`,
   * unrelated to Web Crypto) is used purely as an opaque object key.
   */
  async getVaultUploadUrl(userId: string): Promise<{ uploadUrl: string; path: string; token: string }> {
    const path = `${userId}/${randomUUID()}`;

    const { data, error } = await this.supabase.storage
      .from(VAULT_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      this.logger.error("Failed to create signed vault upload URL", error);
      throw new InternalServerErrorException("Could not generate upload URL");
    }

    return { uploadUrl: data.signedUrl, path, token: data.token };
  }

  async getVaultDownloadUrl(path: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(VAULT_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (error || !data) {
      throw new InternalServerErrorException("Could not generate download URL");
    }
    return data.signedUrl;
  }

  async deleteVaultDocument(path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(VAULT_BUCKET).remove([path]);
    if (error) {
      this.logger.error(`Failed to delete vault document ${path}`, error);
    }
  }
}
