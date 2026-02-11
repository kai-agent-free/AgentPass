/**
 * AES-256-GCM encryption/decryption for AgentPass credential vault.
 *
 * Wire format (all concatenated, then base64url-encoded):
 *   [12-byte IV] [16-byte authTag] [ciphertext...]
 *
 * Key derivation uses HKDF-SHA256 from the agent's Ed25519 private key.
 */

import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  hkdf,
} from "node:crypto";

/** AES-256-GCM constants */
const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12; // NIST-recommended 96-bit nonce
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag
const KEY_LENGTH = 32; // 256-bit key

/** HKDF parameters for vault key derivation */
const HKDF_DIGEST = "sha256";
const HKDF_SALT = "agentpass-vault";
const HKDF_INFO = "credential-vault-key";

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * Generates a fresh random 12-byte IV for every call.
 * Returns a base64url string containing: IV + authTag + ciphertext.
 *
 * @param plaintext - The string to encrypt
 * @param key - A 32-byte AES-256 key
 * @returns base64url-encoded ciphertext bundle
 */
export function encrypt(plaintext: string, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `Encryption key must be ${KEY_LENGTH} bytes, got ${key.length}`,
    );
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Wire format: IV (12) + authTag (16) + ciphertext (variable)
  const bundle = Buffer.concat([iv, authTag, encrypted]);

  return bundle.toString("base64url");
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 *
 * Parses the base64url input to extract IV, authTag, and ciphertext,
 * then decrypts and verifies authenticity.
 *
 * @param encoded - base64url string produced by `encrypt()`
 * @param key - The same 32-byte AES-256 key used for encryption
 * @returns The original plaintext string
 * @throws On wrong key, tampered data, or malformed input
 */
export function decrypt(encoded: string, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `Decryption key must be ${KEY_LENGTH} bytes, got ${key.length}`,
    );
  }

  const bundle = Buffer.from(encoded, "base64url");

  const minLength = IV_LENGTH + AUTH_TAG_LENGTH;
  if (bundle.length < minLength) {
    throw new Error(
      `Encrypted data too short: expected at least ${minLength} bytes, got ${bundle.length}`,
    );
  }

  const iv = bundle.subarray(0, IV_LENGTH);
  const authTag = bundle.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = bundle.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Derive a 32-byte AES-256 vault key from an Ed25519 private key using HKDF.
 *
 * Uses HKDF with SHA-256, a fixed salt and info string so the same
 * private key always produces the same vault key.
 *
 * @param privateKey - base64url-encoded Ed25519 private key
 * @returns A 32-byte Buffer suitable for AES-256-GCM
 */
export async function deriveVaultKey(privateKey: string): Promise<Buffer> {
  const ikm = Buffer.from(privateKey, "base64url");

  if (ikm.length === 0) {
    throw new Error("Private key must not be empty");
  }

  const derived = await new Promise<Buffer>((resolve, reject) => {
    hkdf(
      HKDF_DIGEST,
      ikm,
      HKDF_SALT,
      HKDF_INFO,
      KEY_LENGTH,
      (err, derivedKey) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(Buffer.from(derivedKey));
      },
    );
  });

  return derived;
}
