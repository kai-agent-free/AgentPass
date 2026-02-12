import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Client } from "@libsql/client";
import type { Hono } from "hono";
import {
  generateKeyPair,
  createChallenge,
  signChallenge,
  sign,
} from "@agentpass/core";
import { createApp } from "../index.js";

describe("Verify routes", () => {
  let app: Hono;
  let db: Client;
  let authToken: string;

  beforeEach(async () => {
    const created = await createApp(":memory:");
    app = created.app;
    db = created.db;

    // Register and login to get auth token
    const registerRes = await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@example.com",
        password: "secure-password-123",
        name: "Test Owner",
      }),
    });
    const registerData = await registerRes.json();
    authToken = registerData.token;
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Helper: register a passport and return its ID and the key pair.
   */
  async function setupPassport() {
    const keyPair = generateKeyPair();

    const res = await app.request("/passports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        public_key: keyPair.publicKey,
        name: "verify-test-agent",
        description: "Agent for verification tests",
      }),
    });

    const { passport_id } = await res.json();
    return { passport_id, keyPair };
  }

  // --- POST /verify ---

  describe("POST /verify", () => {
    it("returns valid=true for a correct Ed25519 signature", async () => {
      const { passport_id, keyPair } = await setupPassport();

      const challenge = createChallenge();
      const signature = signChallenge(challenge, keyPair.privateKey);

      const res = await app.request("/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passport_id, challenge, signature }),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.valid).toBe(true);
      expect(data.passport_id).toBe(passport_id);
      expect(data.trust_score).toBe(1); // incremented on success
      expect(data.status).toBe("active");
    });

    it("returns valid=false for an invalid signature", async () => {
      const { passport_id } = await setupPassport();

      const challenge = createChallenge();
      const fakeSignature = "totally-not-a-valid-base64url-signature";

      const res = await app.request("/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passport_id,
          challenge,
          signature: fakeSignature,
        }),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.valid).toBe(false);
      expect(data.trust_score).toBe(0); // not incremented
    });

    it("returns valid=false for a signature from a different key", async () => {
      const { passport_id } = await setupPassport();
      const otherKeyPair = generateKeyPair();

      const challenge = createChallenge();
      const signature = signChallenge(challenge, otherKeyPair.privateKey);

      const res = await app.request("/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passport_id, challenge, signature }),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.valid).toBe(false);
    });

    it("returns 403 for a revoked passport", async () => {
      const { passport_id, keyPair } = await setupPassport();

      // Revoke the passport (requires signature and auth token)
      const revokeSignature = sign(passport_id, keyPair.privateKey);
      await app.request(`/passports/${passport_id}`, {
        method: "DELETE",
        headers: {
          "X-AgentPass-Signature": revokeSignature,
          Authorization: `Bearer ${authToken}`,
        },
      });

      const challenge = createChallenge();
      const signature = signChallenge(challenge, keyPair.privateKey);

      const res = await app.request("/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passport_id, challenge, signature }),
      });

      expect(res.status).toBe(403);

      const data = await res.json();
      expect(data.valid).toBe(false);
      expect(data.code).toBe("PASSPORT_REVOKED");
    });

    it("returns 404 for a non-existent passport", async () => {
      const res = await app.request("/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passport_id: "ap_000000000000",
          challenge: "abc",
          signature: "def",
        }),
      });

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.code).toBe("NOT_FOUND");
    });

    it("returns 400 for missing fields", async () => {
      const res = await app.request("/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passport_id: "ap_000000000000" }),
      });

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("increments trust_score on each successful verification", async () => {
      const { passport_id, keyPair } = await setupPassport();

      // Verify three times
      for (let i = 0; i < 3; i++) {
        const challenge = createChallenge();
        const signature = signChallenge(challenge, keyPair.privateKey);
        await app.request("/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passport_id, challenge, signature }),
        });
      }

      // Check trust_score via GET
      const res = await app.request(`/passports/${passport_id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      expect(data.trust_score).toBe(3);
    });
  });
});
