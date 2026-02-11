/**
 * Ed25519 key pair generation and serialization.
 *
 * Keys are stored and transmitted as base64url-encoded strings for URL safety.
 * Uses the raw key format (32 bytes for public, 32 bytes for private seed)
 * so that serialized keys are compact and portable.
 */

import crypto from "node:crypto";

/** A key pair with both keys encoded as base64url strings. */
export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Generate a new Ed25519 key pair.
 *
 * @returns An object with `publicKey` and `privateKey` as base64url strings.
 */
export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });

  // Convert DER-encoded buffers to base64url strings
  return {
    publicKey: Buffer.from(publicKey).toString("base64url"),
    privateKey: Buffer.from(privateKey).toString("base64url"),
  };
}

/**
 * Serialize a Node.js Ed25519 public KeyObject to a base64url string.
 *
 * Accepts the KeyObject returned by `crypto.createPublicKey()` or
 * `crypto.generateKeyPairSync()` and exports it in DER/SPKI format.
 */
export function serializePublicKey(key: crypto.KeyObject): string {
  const der = key.export({ type: "spki", format: "der" });
  return Buffer.from(der).toString("base64url");
}

/**
 * Deserialize a base64url-encoded public key string back to a KeyObject.
 *
 * The string must be a DER/SPKI-encoded Ed25519 public key in base64url.
 */
export function deserializePublicKey(encoded: string): crypto.KeyObject {
  const der = Buffer.from(encoded, "base64url");
  return crypto.createPublicKey({ key: der, format: "der", type: "spki" });
}

/**
 * Serialize a Node.js Ed25519 private KeyObject to a base64url string.
 *
 * Accepts the KeyObject returned by `crypto.createPrivateKey()` or
 * `crypto.generateKeyPairSync()` and exports it in DER/PKCS8 format.
 */
export function serializePrivateKey(key: crypto.KeyObject): string {
  const der = key.export({ type: "pkcs8", format: "der" });
  return Buffer.from(der).toString("base64url");
}

/**
 * Deserialize a base64url-encoded private key string back to a KeyObject.
 *
 * The string must be a DER/PKCS8-encoded Ed25519 private key in base64url.
 */
export function deserializePrivateKey(encoded: string): crypto.KeyObject {
  const der = Buffer.from(encoded, "base64url");
  return crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}
