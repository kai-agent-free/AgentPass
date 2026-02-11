import { describe, it, expect } from "vitest";
import { generateKeyPair } from "./keys.js";
import {
  sign,
  verify,
  createChallenge,
  signChallenge,
  verifyChallenge,
} from "./signing.js";

describe("sign / verify", () => {
  it("sign + verify succeeds with the correct key pair (string data)", () => {
    const kp = generateKeyPair();
    const data = "hello world";
    const signature = sign(data, kp.privateKey);
    expect(verify(data, signature, kp.publicKey)).toBe(true);
  });

  it("sign + verify succeeds with Buffer data", () => {
    const kp = generateKeyPair();
    const data = Buffer.from([0x00, 0x01, 0xff, 0xfe]);
    const signature = sign(data, kp.privateKey);
    expect(verify(data, signature, kp.publicKey)).toBe(true);
  });

  it("verify returns false with a different public key", () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    const data = "secret payload";
    const signature = sign(data, kp1.privateKey);
    expect(verify(data, signature, kp2.publicKey)).toBe(false);
  });

  it("verify returns false when data has been tampered with", () => {
    const kp = generateKeyPair();
    const data = "original data";
    const signature = sign(data, kp.privateKey);
    expect(verify("tampered data", signature, kp.publicKey)).toBe(false);
  });

  it("verify returns false with a corrupted signature", () => {
    const kp = generateKeyPair();
    const data = "important message";
    const signature = sign(data, kp.privateKey);

    // Flip a character in the signature to corrupt it
    const corrupted =
      signature[0] === "A"
        ? "B" + signature.slice(1)
        : "A" + signature.slice(1);

    expect(verify(data, corrupted, kp.publicKey)).toBe(false);
  });

  it("produces base64url-encoded signatures", () => {
    const kp = generateKeyPair();
    const signature = sign("data", kp.privateKey);
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces deterministic signatures for the same key and data", () => {
    // Ed25519 is deterministic: same key + same message = same signature
    const kp = generateKeyPair();
    const data = "deterministic check";
    const sig1 = sign(data, kp.privateKey);
    const sig2 = sign(data, kp.privateKey);
    expect(sig1).toBe(sig2);
  });

  it("handles empty string data", () => {
    const kp = generateKeyPair();
    const signature = sign("", kp.privateKey);
    expect(verify("", signature, kp.publicKey)).toBe(true);
    expect(verify("non-empty", signature, kp.publicKey)).toBe(false);
  });

  it("handles large payloads", () => {
    const kp = generateKeyPair();
    const data = "x".repeat(100_000);
    const signature = sign(data, kp.privateKey);
    expect(verify(data, signature, kp.publicKey)).toBe(true);
  });
});

describe("createChallenge", () => {
  it("returns a 64-character hex string (32 bytes)", () => {
    const challenge = createChallenge();
    expect(challenge).toHaveLength(64);
    expect(challenge).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces unique challenges on each call", () => {
    const challenges = new Set(
      Array.from({ length: 100 }, () => createChallenge()),
    );
    expect(challenges.size).toBe(100);
  });
});

describe("signChallenge / verifyChallenge", () => {
  it("full challenge-response flow succeeds with correct keys", () => {
    const kp = generateKeyPair();

    // Step 1: Server creates challenge
    const challenge = createChallenge();

    // Step 2: Agent signs challenge
    const signature = signChallenge(challenge, kp.privateKey);

    // Step 3: Server verifies
    expect(verifyChallenge(challenge, signature, kp.publicKey)).toBe(true);
  });

  it("challenge verification fails with wrong key", () => {
    const agent = generateKeyPair();
    const impersonator = generateKeyPair();

    const challenge = createChallenge();
    const signature = signChallenge(challenge, impersonator.privateKey);

    // Server verifies against the real agent's public key
    expect(verifyChallenge(challenge, signature, agent.publicKey)).toBe(false);
  });

  it("challenge verification fails with a different challenge", () => {
    const kp = generateKeyPair();
    const challenge1 = createChallenge();
    const challenge2 = createChallenge();

    const signature = signChallenge(challenge1, kp.privateKey);

    // Verify against a different challenge
    expect(verifyChallenge(challenge2, signature, kp.publicKey)).toBe(false);
  });

  it("challenge verification fails with a replayed (old) signature on a new challenge", () => {
    const kp = generateKeyPair();

    // First round
    const oldChallenge = createChallenge();
    const oldSignature = signChallenge(oldChallenge, kp.privateKey);

    // Second round with new challenge
    const newChallenge = createChallenge();

    // Replay attack: use old signature on new challenge
    expect(verifyChallenge(newChallenge, oldSignature, kp.publicKey)).toBe(
      false,
    );
  });
});

describe("interoperability between sign/verify and signChallenge/verifyChallenge", () => {
  it("signChallenge output can be verified with generic verify", () => {
    const kp = generateKeyPair();
    const challenge = createChallenge();
    const signature = signChallenge(challenge, kp.privateKey);

    // signChallenge delegates to sign, so generic verify should work
    expect(verify(challenge, signature, kp.publicKey)).toBe(true);
  });

  it("generic sign output can be verified with verifyChallenge", () => {
    const kp = generateKeyPair();
    const challenge = createChallenge();
    const signature = sign(challenge, kp.privateKey);

    expect(verifyChallenge(challenge, signature, kp.publicKey)).toBe(true);
  });
});
