import { Injectable, Logger, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "asset-documents";
const SIGNED_URL_TTL_SECONDS = 3600; // 1 hour

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly supabase;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>("SUPABASE_URL") ?? "";
    const key = this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    this.supabase = createClient(url, key, { auth: { persistSession: false } });
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

  /**
   * Deletes a file from storage.
   */
  async deleteFile(path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(BUCKET).remove([path]);
    if (error) {
      this.logger.error(`Failed to delete file ${path}`, error);
    }
  }
}
