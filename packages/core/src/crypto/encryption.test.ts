import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt, deriveVaultKey } from "./encryption.js";

/**
 * Generate a random 32-byte AES-256 key for testing.
 */
function randomKey(): Buffer {
  return randomBytes(32);
}

/**
 * Generate a fake base64url-encoded Ed25519 private key (32 random bytes).
 */
function fakePrivateKey(): string {
  return randomBytes(32).toString("base64url");
}

describe("AES-256-GCM encrypt/decrypt", () => {
  it("should encrypt then decrypt and return original plaintext", () => {
    const key = randomKey();
    const plaintext = "Hello, AgentPass! This is secret credential data.";

    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);

    expect(decrypted).toBe(plaintext);
  });

  it("should handle empty string plaintext", () => {
    const key = randomKey();
    const plaintext = "";

    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);

    expect(decrypted).toBe(plaintext);
  });

  it("should handle unicode plaintext", () => {
    const key = randomKey();
    const plaintext = "Credentials: user=admin, pass=p@$$w0rd!";

    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);

    expect(decrypted).toBe(plaintext);
  });

  it("should produce different ciphertexts for the same plaintext due to random IV", () => {
    const key = randomKey();
    const plaintext = "same-plaintext-every-time";

    const encrypted1 = encrypt(plaintext, key);
    const encrypted2 = encrypt(plaintext, key);

    // Ciphertexts must differ (different random IVs)
    expect(encrypted1).not.toBe(encrypted2);

    // But both must decrypt to the same plaintext
    expect(decrypt(encrypted1, key)).toBe(plaintext);
    expect(decrypt(encrypted2, key)).toBe(plaintext);
  });

  it("should fail to decrypt with the wrong key", () => {
    const key1 = randomKey();
    const key2 = randomKey();
    const plaintext = "secret data";

    const encrypted = encrypt(plaintext, key1);

    expect(() => decrypt(encrypted, key2)).toThrow();
  });

  it("should fail when ciphertext is tampered with", () => {
    const key = randomKey();
    const plaintext = "important credential";

    const encrypted = encrypt(plaintext, key);

    // Decode, flip a byte in the ciphertext portion, re-encode
    const bundle = Buffer.from(encrypted, "base64url");
    // The ciphertext starts at byte 28 (12 IV + 16 authTag)
    const tamperIndex = 28;
    if (bundle.length > tamperIndex) {
      bundle[tamperIndex] = bundle[tamperIndex]! ^ 0xff;
    }
    const tampered = bundle.toString("base64url");

    expect(() => decrypt(tampered, key)).toThrow();
  });

  it("should fail when auth tag is tampered with", () => {
    const key = randomKey();
    const plaintext = "authenticated data";

    const encrypted = encrypt(plaintext, key);

    // Decode, flip a byte in the authTag portion (bytes 12-27)
    const bundle = Buffer.from(encrypted, "base64url");
    const tamperIndex = 14; // within the auth tag
    bundle[tamperIndex] = bundle[tamperIndex]! ^ 0xff;
    const tampered = bundle.toString("base64url");

    expect(() => decrypt(tampered, key)).toThrow();
  });

  it("should reject a key that is not 32 bytes", () => {
    const shortKey = randomBytes(16);
    const plaintext = "test";

    expect(() => encrypt(plaintext, shortKey)).toThrow(
      /key must be 32 bytes/i,
    );
    expect(() => decrypt("dGVzdA", shortKey)).toThrow(/key must be 32 bytes/i);
  });

  it("should reject encrypted data that is too short", () => {
    const key = randomKey();
    // Less than 28 bytes (12 IV + 16 authTag)
    const tooShort = randomBytes(10).toString("base64url");

    expect(() => decrypt(tooShort, key)).toThrow(/too short/i);
  });
});

describe("deriveVaultKey", () => {
  it("should produce a consistent 32-byte key for the same private key", async () => {
    const pk = fakePrivateKey();

    const key1 = await deriveVaultKey(pk);
    const key2 = await deriveVaultKey(pk);

    expect(key1.length).toBe(32);
    expect(key2.length).toBe(32);
    expect(key1.equals(key2)).toBe(true);
  });

  it("should produce different keys for different private keys", async () => {
    const pk1 = fakePrivateKey();
    const pk2 = fakePrivateKey();

    const key1 = await deriveVaultKey(pk1);
    const key2 = await deriveVaultKey(pk2);

    expect(key1.equals(key2)).toBe(false);
  });

  it("should produce a key usable for encrypt/decrypt", async () => {
    const pk = fakePrivateKey();
    const key = await deriveVaultKey(pk);
    const plaintext = "credential encrypted with derived key";

    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);

    expect(decrypted).toBe(plaintext);
  });

  it("should reject an empty private key", async () => {
    // base64url of empty buffer is an empty string
    await expect(deriveVaultKey("")).rejects.toThrow(/must not be empty/i);
  });
});
