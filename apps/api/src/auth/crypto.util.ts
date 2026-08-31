import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * AES-256-GCM encrypt/decrypt for secrets at rest (currently: MFA TOTP
 * secrets). GCM is authenticated — tampering with the stored ciphertext
 * fails decryption instead of silently returning garbage.
 *
 * Output format: "<iv>:<authTag>:<ciphertext>", each hex-encoded.
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, the GCM-recommended size

function deriveKey(rawKey: string): Buffer {
  // A real 32-byte key, hex-encoded (64 hex chars) — the expected format,
  // e.g. from `openssl rand -hex 32`. Falls back to deriving a key via
  // scrypt for any other string, so a non-hex value still works safely
  // rather than throwing, but a proper hex key is what MFA_ENCRYPTION_KEY
  // should actually be set to.
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, "hex");
  }
  return scryptSync(rawKey, "richerwealth-mfa-secret-v1", 32);
}

export function encryptSecret(plaintext: string, rawKey: string): string {
  const key = deriveKey(rawKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decryptSecret(ciphertext: string, rawKey: string): string {
  const parts = ciphertext.split(":");
  const [ivHex, authTagHex, dataHex] = parts;
  if (parts.length !== 3 || !ivHex || !authTagHex || !dataHex) {
    throw new Error("Malformed encrypted secret (expected iv:authTag:ciphertext)");
  }
  const key = deriveKey(rawKey);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
