"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  generateVaultSalt,
  deriveVaultKey,
  encryptBytes,
  decryptBytes,
  encryptText,
  decryptText,
  bufferToBase64,
  base64ToBuffer,
  VAULT_CANARY_PLAINTEXT,
} from "@richer/shared-types";
import type { VaultDocumentDto, VaultSaltResponse, VaultDocumentCategory } from "@richer/shared-types";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
const VAULT_BUCKET = "vault-documents";

async function getAuthHeader(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await getAuthHeader();
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: { ...headers, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

export function useVaultSalt() {
  return useQuery<VaultSaltResponse>({
    queryKey: ["vault", "salt"],
    queryFn: () => authedFetch("/vault/salt"),
  });
}

export function useVaultDocuments() {
  return useQuery<VaultDocumentDto[]>({
    queryKey: ["vault", "documents"],
    queryFn: () => authedFetch("/vault"),
  });
}

/**
 * Vault setup: generate a fresh salt client-side, derive the AES key from
 * the passphrase the user just chose, encrypt a known canary string with
 * it (so "unlock" can be verified later without a real document), and
 * send ONLY the salt + canary ciphertext/IV to the server — the passphrase
 * and the derived key itself never leave this function.
 */
export function useSetupVault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (passphrase: string): Promise<CryptoKey> => {
      const saltB64 = generateVaultSalt();
      const key = await deriveVaultKey(passphrase, saltB64);
      const { ciphertext, ivB64 } = await encryptText(key, VAULT_CANARY_PLAINTEXT);

      await authedFetch("/vault/setup", {
        method: "POST",
        body: JSON.stringify({ saltB64, canaryB64: bufferToBase64(ciphertext), canaryIvB64: ivB64 }),
      });

      return key;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vault", "salt"] }),
  });
}

/**
 * Vault unlock: fetch the stored salt + canary, derive the key from the
 * re-entered passphrase, and try to decrypt the canary. AES-GCM's
 * authenticated encryption means a wrong passphrase makes this throw
 * (auth-tag mismatch) rather than silently "succeeding" with garbage —
 * that's the entire mechanism this function relies on.
 */
export function useUnlockVault() {
  return useMutation({
    mutationFn: async (passphrase: string): Promise<CryptoKey> => {
      const salt = await authedFetch<VaultSaltResponse>("/vault/salt");
      if (!salt.saltB64) throw new Error("Vault has not been set up yet.");

      const canary = await authedFetch<{ canaryB64: string; canaryIvB64: string } | null>("/vault/canary");
      const key = await deriveVaultKey(passphrase, salt.saltB64);

      if (canary) {
        try {
          const decrypted = await decryptText(key, base64ToBuffer(canary.canaryB64), canary.canaryIvB64);
          if (decrypted !== VAULT_CANARY_PLAINTEXT) throw new Error("mismatch");
        } catch {
          throw new Error("Incorrect passphrase.");
        }
      }

      return key;
    },
  });
}

interface UploadVaultDocumentArgs {
  file: File;
  category: VaultDocumentCategory;
  vaultKey: CryptoKey;
  linkedAssetId?: string | null;
}

/**
 * Full zero-knowledge upload: encrypt the file bytes AND the filename
 * client-side with the caller-supplied vaultKey, request a presigned URL,
 * PUT the ciphertext directly to Supabase Storage (server never sees the
 * File object — only ever the encrypt() output), then register the
 * metadata row. The plaintext `file`/`file.name` never appear in any
 * network request this function makes to RicherWealth's own API.
 */
export function useUploadVaultDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, category, vaultKey, linkedAssetId }: UploadVaultDocumentArgs) => {
      const fileBytes = await file.arrayBuffer();
      const { ciphertext, ivB64 } = await encryptBytes(vaultKey, fileBytes);
      const encFilename = await encryptText(vaultKey, file.name);

      const signed = await authedFetch<{ uploadUrl: string; path: string; token: string }>("/vault/upload-url", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, mimeType: file.type }),
      });

      const supabase = createClient();
      const ciphertextBlob = new Blob([ciphertext], { type: "application/octet-stream" });
      const { error: uploadError } = await supabase.storage
        .from(VAULT_BUCKET)
        .uploadToSignedUrl(signed.path, signed.token, ciphertextBlob, { contentType: "application/octet-stream" });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      return authedFetch<VaultDocumentDto>("/vault/register", {
        method: "POST",
        body: JSON.stringify({
          category,
          storagePath: signed.path,
          encryptedFilename: bufferToBase64(encFilename.ciphertext),
          encryptedFilenameIv: encFilename.ivB64,
          mimeType: file.type || "application/octet-stream",
          fileSizeBytes: file.size,
          iv: ivB64,
          linkedAssetId: linkedAssetId ?? null,
        }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vault", "documents"] }),
  });
}

export interface DecryptedVaultDocument {
  blob: Blob;
  filename: string;
}

/**
 * In-browser decrypt: fetch the ciphertext via a short-lived signed URL,
 * decrypt entirely client-side with the caller-supplied vaultKey, and hand
 * back a Blob for local rendering (Object URL). The decrypted bytes are
 * never sent anywhere — this function makes no network call after the GET.
 */
export async function downloadAndDecryptVaultDocument(id: string, vaultKey: CryptoKey): Promise<DecryptedVaultDocument> {
  const meta = await authedFetch<{ downloadUrl: string; encryptedFilename: string; encryptedFilenameIv: string; iv: string; mimeType: string }>(
    `/vault/${id}/download-url`,
  );

  const res = await fetch(meta.downloadUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const ciphertext = await res.arrayBuffer();

  const plaintext = await decryptBytes(vaultKey, ciphertext, meta.iv);
  const filename = await decryptText(vaultKey, base64ToBuffer(meta.encryptedFilename), meta.encryptedFilenameIv);

  return { blob: new Blob([plaintext], { type: meta.mimeType }), filename };
}

export function useDeleteVaultDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => authedFetch<{ deleted: true }>(`/vault/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vault", "documents"] }),
  });
}
