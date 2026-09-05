/**
 * Phase 16 zero-knowledge vault — pure, isomorphic AES-256-GCM + PBKDF2
 * crypto. Uses only the standard Web Crypto `SubtleCrypto` API (available as
 * `globalThis.crypto.subtle` in every modern browser AND in Node 19+, which
 * is what makes this file real-Jest-testable without a browser or a mock).
 *
 * Lives in packages/shared-types (not apps/web) for exactly one reason:
 * apps/web has no Jest runner configured anywhere in this repo (no
 * jest.config, no "test" script, zero *.spec.ts files) — confirmed by
 * inspection, not assumed. packages/shared-types has a real, working Jest
 * setup, so putting the crypto here is what makes the round-trip/
 * determinism/wrong-passphrase acceptance criteria actually testable by an
 * automated suite rather than only by manual browser verification. This is
 * NOT a step toward giving the server decryption capability — apps/api
 * never imports this module (grep-verifiable), and nothing in this file
 * talks to a database, the network, or any RicherWealth backend. A shared
 * npm workspace package is just where the code sits; only what actually
 * imports and calls it determines who can decrypt.
 */

const PBKDF2_ITERATIONS = 250_000;
const AES_KEY_LENGTH_BITS = 256;
const GCM_IV_LENGTH_BYTES = 12; // NIST-recommended length for AES-GCM

function getSubtle(): SubtleCrypto {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error("Web Crypto (crypto.subtle) is not available in this environment.");
  }
  return c.subtle;
}

function getRandomValues(length: number): Uint8Array {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (!c?.getRandomValues) {
    throw new Error("crypto.getRandomValues is not available in this environment.");
  }
  return c.getRandomValues(new Uint8Array(length));
}

export function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  // btoa exists in browsers; Node exposes it as a global since v16 too.
  const b64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return b64;
}

export function base64ToBuffer(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/** A fresh, non-secret 16-byte PBKDF2 salt — safe to store server-side. */
export function generateVaultSalt(): string {
  return bufferToBase64(getRandomValues(16));
}

/**
 * Derives a 256-bit AES-GCM key from a user's vault passphrase + their
 * stored (non-secret) salt via PBKDF2-SHA256, 250,000 iterations. The same
 * passphrase + salt ALWAYS derives the identical key (asserted directly by
 * crypto.spec.ts's determinism test) — this is what lets a user "unlock"
 * the same vault from any device/session without the passphrase ever being
 * sent to or stored by the server.
 */
export async function deriveVaultKey(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const salt = base64ToBuffer(saltB64);

  const keyMaterial = await subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);

  return subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: AES_KEY_LENGTH_BITS },
    false, // not extractable — the raw key bytes can never be read back out, even by our own frontend code
    ["encrypt", "decrypt"],
  );
}

export interface EncryptedPayload {
  ciphertext: ArrayBuffer;
  ivB64: string;
}

/**
 * AES-256-GCM encrypt. A fresh random 12-byte IV is generated per call —
 * required for GCM's security guarantee (an IV must never be reused with
 * the same key) and why every VaultDocument stores its own `iv` alongside
 * the shared per-user key.
 */
export async function encryptBytes(key: CryptoKey, plaintext: ArrayBuffer | Uint8Array): Promise<EncryptedPayload> {
  const subtle = getSubtle();
  const iv = getRandomValues(GCM_IV_LENGTH_BYTES);
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, plaintext as BufferSource);
  return { ciphertext, ivB64: bufferToBase64(iv) };
}

/**
 * AES-256-GCM decrypt. GCM is authenticated — decrypting with the wrong key
 * (e.g. a mistyped passphrase, which derives a *different* key) makes the
 * auth-tag check fail and `subtle.decrypt` REJECTS its promise; it can
 * never silently return corrupted-but-plausible plaintext. Callers should
 * catch and surface this as "Incorrect passphrase", not a generic error.
 */
export async function decryptBytes(key: CryptoKey, ciphertext: ArrayBuffer | Uint8Array, ivB64: string): Promise<ArrayBuffer> {
  const subtle = getSubtle();
  const iv = base64ToBuffer(ivB64);
  return subtle.decrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, ciphertext as BufferSource);
}

export async function encryptText(key: CryptoKey, text: string): Promise<EncryptedPayload> {
  return encryptBytes(key, new TextEncoder().encode(text));
}

export async function decryptText(key: CryptoKey, ciphertext: ArrayBuffer | Uint8Array, ivB64: string): Promise<string> {
  const plainBuf = await decryptBytes(key, ciphertext, ivB64);
  return new TextDecoder().decode(plainBuf);
}

/** The fixed string encrypted at vault setup time to make "unlock" verifiable without a real document. */
export const VAULT_CANARY_PLAINTEXT = "richerwealth-vault-canary-v1";
