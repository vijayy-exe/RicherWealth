import {
  generateVaultSalt,
  deriveVaultKey,
  encryptBytes,
  decryptBytes,
  encryptText,
  decryptText,
  VAULT_CANARY_PLAINTEXT,
} from "./crypto";

describe("vault crypto — AES-256-GCM + PBKDF2 (packages/shared-types/src/vault/crypto.ts)", () => {
  it("round-trips arbitrary bytes byte-for-byte identical (acceptance criterion)", async () => {
    const salt = generateVaultSalt();
    const key = await deriveVaultKey("correct horse battery staple", salt);

    // Deliberately not text-like — includes null bytes, high bytes, a run
    // that could confuse a naive length/encoding bug.
    const original = new Uint8Array([0, 1, 2, 255, 254, 253, 0, 0, 128, 127, 42, 9, 10, 13]);
    const { ciphertext, ivB64 } = await encryptBytes(key, original);

    // The ciphertext must not equal the plaintext (sanity — encryption happened).
    const cipherBytes = new Uint8Array(ciphertext);
    expect(cipherBytes.length).toBeGreaterThanOrEqual(original.length); // GCM appends a 16-byte auth tag
    expect(Buffer.compare(Buffer.from(cipherBytes.slice(0, original.length)), Buffer.from(original))).not.toBe(0);

    const decrypted = await decryptBytes(key, ciphertext, ivB64);
    const decryptedBytes = new Uint8Array(decrypted);

    expect(decryptedBytes.length).toBe(original.length);
    expect(Buffer.compare(Buffer.from(decryptedBytes), Buffer.from(original))).toBe(0);
  });

  it("round-trips a larger pseudo-file (10KB) byte-for-byte identical", async () => {
    const salt = generateVaultSalt();
    const key = await deriveVaultKey("another-passphrase-123", salt);

    const original = new Uint8Array(10_240);
    for (let i = 0; i < original.length; i++) original[i] = (i * 37 + 11) % 256;

    const { ciphertext, ivB64 } = await encryptBytes(key, original);
    const decrypted = new Uint8Array(await decryptBytes(key, ciphertext, ivB64));

    expect(Buffer.compare(Buffer.from(decrypted), Buffer.from(original))).toBe(0);
  });

  it("round-trips text (filename) via encryptText/decryptText", async () => {
    const salt = generateVaultSalt();
    const key = await deriveVaultKey("filename-test-pass", salt);

    const original = "Aadhaar_1234_scan_final_v2.pdf";
    const { ciphertext, ivB64 } = await encryptText(key, original);
    const decrypted = await decryptText(key, ciphertext, ivB64);

    expect(decrypted).toBe(original);
  });

  it("derives the identical key from the same passphrase + salt, always (determinism)", async () => {
    const salt = generateVaultSalt();
    const keyA = await deriveVaultKey("my-vault-passphrase", salt);
    const keyB = await deriveVaultKey("my-vault-passphrase", salt);

    // CryptoKey objects aren't extractable/comparable directly (by design —
    // see the `extractable: false` in deriveVaultKey), so determinism is
    // proven behaviorally: data encrypted under keyA must decrypt under keyB.
    const original = new TextEncoder().encode("determinism-check-payload");
    const { ciphertext, ivB64 } = await encryptBytes(keyA, original);
    const decrypted = await decryptBytes(keyB, ciphertext, ivB64);

    expect(new TextDecoder().decode(decrypted)).toBe("determinism-check-payload");
  });

  it("derives a DIFFERENT key for a different passphrase with the same salt", async () => {
    const salt = generateVaultSalt();
    const keyA = await deriveVaultKey("passphrase-one", salt);
    const keyB = await deriveVaultKey("passphrase-two", salt);

    const { ciphertext, ivB64 } = await encryptBytes(keyA, new TextEncoder().encode("secret"));
    await expect(decryptBytes(keyB, ciphertext, ivB64)).rejects.toThrow();
  });

  it("fails cleanly (rejects, never silently returns garbage) on a wrong passphrase — acceptance criterion", async () => {
    const salt = generateVaultSalt();
    const correctKey = await deriveVaultKey("the-real-passphrase", salt);
    const wrongKey = await deriveVaultKey("a-mistyped-passphrase", salt);

    const { ciphertext, ivB64 } = await encryptText(correctKey, VAULT_CANARY_PLAINTEXT);

    // AES-GCM is authenticated: a wrong key fails the auth-tag check and
    // subtle.decrypt REJECTS — it cannot return corrupted-but-plausible
    // plaintext. This is the exact mechanism the "unlock vault" screen
    // relies on to detect a mistyped passphrase.
    await expect(decryptBytes(wrongKey, ciphertext, ivB64)).rejects.toThrow();
  });

  it("fails cleanly on a tampered ciphertext (auth tag integrity)", async () => {
    const salt = generateVaultSalt();
    const key = await deriveVaultKey("integrity-test-pass", salt);
    const { ciphertext, ivB64 } = await encryptBytes(key, new TextEncoder().encode("tamper me"));

    const tampered = new Uint8Array(ciphertext);
    tampered[0] = tampered[0]! ^ 0xff; // flip a bit

    await expect(decryptBytes(key, tampered.buffer, ivB64)).rejects.toThrow();
  });

  it("generates a fresh, different IV on every encryptBytes call (never reused)", async () => {
    const salt = generateVaultSalt();
    const key = await deriveVaultKey("iv-reuse-check", salt);
    const plaintext = new TextEncoder().encode("same plaintext twice");

    const a = await encryptBytes(key, plaintext);
    const b = await encryptBytes(key, plaintext);

    expect(a.ivB64).not.toBe(b.ivB64);
    // Same plaintext + same key but different IV must produce different ciphertext.
    expect(Buffer.from(a.ciphertext).equals(Buffer.from(b.ciphertext))).toBe(false);
  });

  it("generates a non-empty, distinct salt on each call", () => {
    const s1 = generateVaultSalt();
    const s2 = generateVaultSalt();
    expect(s1.length).toBeGreaterThan(0);
    expect(s1).not.toBe(s2);
  });
});
