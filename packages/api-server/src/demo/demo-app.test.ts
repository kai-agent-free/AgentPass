import { describe, it, expect, beforeEach } from "vitest";
import {
  generateKeyPair,
  createChallenge,
  signChallenge,
} from "@agentpass/core";
import { createDemoApp } from "./demo-app.js";

describe("Demo App — Login with AgentPass", () => {
  let app: ReturnType<typeof createDemoApp>["app"];
  let registerAgent: ReturnType<typeof createDemoApp>["registerAgent"];

  beforeEach(() => {
    const demo = createDemoApp();
    app = demo.app;
    registerAgent = demo.registerAgent;
  });

  // --- Discovery endpoint ---

  describe("GET /.well-known/agentpass.json", () => {
    it("returns correct discovery structure", async () => {
      const res = await app.request("/.well-known/agentpass.json");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual({
        agentpass: true,
        auth_endpoint: "/api/auth/agent",
        capabilities: ["ed25519-verification"],
      });
    });
  });

  // --- Landing page ---

  describe("GET /", () => {
    it("returns HTML page with login button", async () => {
      const res = await app.request("/");
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("Login with AgentPass");
      expect(html).toContain("Demo Service");
    });
  });

  // --- Challenge endpoint ---

  describe("POST /api/auth/agent/challenge", () => {
    it("returns a challenge string", async () => {
      const res = await app.request("/api/auth/agent/challenge", {
        method: "POST",
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(typeof data.challenge).toBe("string");
      expect(data.challenge.length).toBeGreaterThan(0);
    });

    it("returns different challenges on each call", async () => {
      const res1 = await app.request("/api/auth/agent/challenge", {
        method: "POST",
      });
      const res2 = await app.request("/api/auth/agent/challenge", {
        method: "POST",
      });

      const data1 = await res1.json();
      const data2 = await res2.json();
      expect(data1.challenge).not.toBe(data2.challenge);
    });
  });

  // --- Verify endpoint ---

  describe("POST /api/auth/agent/verify", () => {
    it("returns session token for valid signature", async () => {
      const keyPair = generateKeyPair();
      const passportId = "ap_demo_test_01";
      registerAgent(passportId, keyPair.publicKey, "demo-agent");

      // Step 1: Get challenge from the demo service
      const challengeRes = await app.request("/api/auth/agent/challenge", {
        method: "POST",
      });
      const { challenge } = await challengeRes.json();

      // Step 2: Sign it
      const signature = signChallenge(challenge, keyPair.privateKey);

      // Step 3: Verify
      const verifyRes = await app.request("/api/auth/agent/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passport_id: passportId,
          challenge,
          signature,
        }),
      });

      expect(verifyRes.status).toBe(200);

      const data = await verifyRes.json();
      expect(typeof data.session_token).toBe("string");
      expect(data.session_token.length).toBeGreaterThan(0);
      expect(data.agent_name).toBe("demo-agent");
    });

    it("returns 401 for invalid signature", async () => {
      const keyPair = generateKeyPair();
      const passportId = "ap_demo_test_02";
      registerAgent(passportId, keyPair.publicKey, "demo-agent");

      const challengeRes = await app.request("/api/auth/agent/challenge", {
        method: "POST",
      });
      const { challenge } = await challengeRes.json();

      const verifyRes = await app.request("/api/auth/agent/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passport_id: passportId,
          challenge,
          signature: "invalid-signature-data",
        }),
      });

      expect(verifyRes.status).toBe(401);

      const data = await verifyRes.json();
      expect(data.error).toBe("Invalid signature");
    });

    it("returns 401 for signature from a different key", async () => {
      const keyPair = generateKeyPair();
      const otherKeyPair = generateKeyPair();
      const passportId = "ap_demo_test_03";
      registerAgent(passportId, keyPair.publicKey, "demo-agent");

      const challengeRes = await app.request("/api/auth/agent/challenge", {
        method: "POST",
      });
      const { challenge } = await challengeRes.json();

      // Sign with a different private key
      const signature = signChallenge(challenge, otherKeyPair.privateKey);

      const verifyRes = await app.request("/api/auth/agent/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passport_id: passportId,
          challenge,
          signature,
        }),
      });

      expect(verifyRes.status).toBe(401);
    });

    it("returns 404 for unknown passport ID", async () => {
      const challengeRes = await app.request("/api/auth/agent/challenge", {
        method: "POST",
      });
      const { challenge } = await challengeRes.json();

      const verifyRes = await app.request("/api/auth/agent/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passport_id: "ap_nonexistent",
          challenge,
          signature: "whatever",
        }),
      });

      expect(verifyRes.status).toBe(404);
    });

    it("returns 400 for unknown/expired challenge", async () => {
      const keyPair = generateKeyPair();
      const passportId = "ap_demo_test_04";
      registerAgent(passportId, keyPair.publicKey, "demo-agent");

      const fakeChallenge = "not-a-real-challenge";
      const signature = signChallenge(fakeChallenge, keyPair.privateKey);

      const verifyRes = await app.request("/api/auth/agent/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passport_id: passportId,
          challenge: fakeChallenge,
          signature,
        }),
      });

      expect(verifyRes.status).toBe(400);
      const data = await verifyRes.json();
      expect(data.error).toContain("Unknown or expired challenge");
    });

    it("returns 400 for missing fields", async () => {
      const verifyRes = await app.request("/api/auth/agent/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passport_id: "ap_something" }),
      });

      expect(verifyRes.status).toBe(400);
    });
  });

  // --- Profile endpoint ---

  describe("GET /api/auth/agent/profile", () => {
    it("returns agent profile with valid session token", async () => {
      const keyPair = generateKeyPair();
      const passportId = "ap_demo_profile";
      registerAgent(passportId, keyPair.publicKey, "profile-agent");

      // Authenticate
      const challengeRes = await app.request("/api/auth/agent/challenge", {
        method: "POST",
      });
      const { challenge } = await challengeRes.json();
      const signature = signChallenge(challenge, keyPair.privateKey);

      const verifyRes = await app.request("/api/auth/agent/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passport_id: passportId, challenge, signature }),
      });
      const { session_token } = await verifyRes.json();

      // Fetch profile
      const profileRes = await app.request("/api/auth/agent/profile", {
        headers: { Authorization: `Bearer ${session_token}` },
      });

      expect(profileRes.status).toBe(200);

      const profile = await profileRes.json();
      expect(profile.passport_id).toBe(passportId);
      expect(profile.agent_name).toBe("profile-agent");
      expect(profile.authenticated_at).toBeTruthy();
    });

    it("returns 401 without Authorization header", async () => {
      const profileRes = await app.request("/api/auth/agent/profile");
      expect(profileRes.status).toBe(401);
    });

    it("returns 401 with invalid session token", async () => {
      const profileRes = await app.request("/api/auth/agent/profile", {
        headers: { Authorization: "Bearer invalid-token" },
      });
      expect(profileRes.status).toBe(401);
    });
  });
});
