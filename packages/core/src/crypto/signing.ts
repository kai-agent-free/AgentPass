/**
 * Ed25519 digital signatures and challenge-response authentication.
 *
 * All keys and signatures are passed as base64url strings for URL safety.
 * Internally, keys are re-hydrated to KeyObjects for each operation so that
 * callers never need to manage raw buffers.
 */

import crypto from "node:crypto";
import { deserializePrivateKey, deserializePublicKey } from "./keys.js";

/**
 * Sign arbitrary data with an Ed25519 private key.
 *
 * @param data      - The payload to sign (string or Buffer).
 * @param privateKey - The signer's private key as a base64url string.
 * @returns The Ed25519 signature encoded as a base64url string.
 */
export function sign(data: string | Buffer, privateKey: string): string {
  const keyObject = deserializePrivateKey(privateKey);
  const payload = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  const signature = crypto.sign(null, payload, keyObject);
  return Buffer.from(signature).toString("base64url");
}

/**
 * Verify an Ed25519 signature on arbitrary data.
 *
 * @param data      - The original payload (string or Buffer).
 * @param signature - The signature to verify as a base64url string.
 * @param publicKey - The signer's public key as a base64url string.
 * @returns `true` if the signature is valid, `false` otherwise.
 */
export function verify(
  data: string | Buffer,
  signature: string,
  publicKey: string,
): boolean {
  const keyObject = deserializePublicKey(publicKey);
  const payload = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  const sig = Buffer.from(signature, "base64url");
  return crypto.verify(null, payload, keyObject, sig);
}

/**
 * Generate a cryptographically random 32-byte challenge as a hex string.
 *
 * Used as the first step of a challenge-response authentication flow:
 * 1. Server calls `createChallenge()` and sends the challenge to the agent.
 * 2. Agent calls `signChallenge(challenge, privateKey)`.
 * 3. Server calls `verifyChallenge(challenge, signature, publicKey)`.
 */
export function createChallenge(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Sign a hex-encoded challenge string with an Ed25519 private key.
 *
 * @param challenge  - The challenge string (hex).
 * @param privateKey - The signer's private key as a base64url string.
 * @returns The signature as a base64url string.
 */
export function signChallenge(
  challenge: string,
  privateKey: string,
): string {
  return sign(challenge, privateKey);
}

/**
 * Verify a signed challenge against the expected public key.
 *
 * @param challenge  - The original challenge string (hex).
 * @param signature  - The signature to verify as a base64url string.
 * @param publicKey  - The signer's public key as a base64url string.
 * @returns `true` if the challenge signature is valid.
 */
export function verifyChallenge(
  challenge: string,
  signature: string,
  publicKey: string,
): boolean {
  return verify(challenge, signature, publicKey);
}
