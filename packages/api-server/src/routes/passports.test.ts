import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Sql } from "../db/schema.js";
import type { Hono } from "hono";
import { createApp } from "../index.js";
import { generateKeyPair, sign } from "@agentpass/core";

describe("Passport routes", () => {
  let app: Hono;
  let db: Sql;
  let authToken: string;
  let ownerEmail: string;

  beforeEach(async () => {
    const created = await createApp(process.env.DATABASE_URL || "postgresql://localhost:5432/agentpass_test");
    app = created.app;
    db = created.db;

    // Clean up tables before each test
    await db`TRUNCATE TABLE browser_commands, browser_sessions, escalations, approvals, api_keys, audit_log, passports, owners CASCADE`;

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
    ownerEmail = registerData.email;
  });

  afterEach(async () => {
    await db.end();
  });

  // --- Helper ---
  async function registerPassport(overrides: Record<string, unknown> = {}) {
    const body = {
      public_key: "MCowBQYDK2VwAyEATestKeyBase64UrlEncodedHere12345",
      name: "test-agent",
      description: "A test agent passport",
      ...overrides,
    };
    const res = await app.request("/passports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });
    return res;
  }

  // --- POST /passports ---

  describe("POST /passports", () => {
    it("creates a passport and returns 201 with passport_id", async () => {
      const res = await registerPassport();
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.passport_id).toMatch(/^ap_[a-f0-9]{12}$/);
      expect(data.created_at).toBeDefined();
    });

    it("persists the passport in the database", async () => {
      const res = await registerPassport();
      const data = await res.json();

      const result = await db`SELECT * FROM passports WHERE id = ${data.passport_id}`;
      const row = result[0] as unknown as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.name).toBe("test-agent");
      expect(row.status).toBe("active");
      expect(row.trust_score).toBe(0);
    });

    it("returns 400 for missing required fields", async () => {
      const res = await app.request("/passports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ public_key: "abc" }),
      });
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
      expect(data.details).toBeDefined();
    });


    it("returns 400 for invalid name characters", async () => {
      const res = await registerPassport({ name: "bad name with spaces" });
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for invalid JSON body", async () => {
      const res = await app.request("/passports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: "not json",
      });
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe("INVALID_JSON");
    });

    it("returns 401 without auth token", async () => {
      const res = await app.request("/passports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_key: "MCowBQYDK2VwAyEATestKeyBase64UrlEncodedHere12345",
          name: "test-agent",
        }),
      });
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.code).toBe("AUTH_REQUIRED");
    });

    it("sets owner_email from JWT, not request body", async () => {
      const res = await registerPassport();
      expect(res.status).toBe(201);

      const { passport_id } = await res.json();
      const result = await db`SELECT owner_email FROM passports WHERE id = ${passport_id}`;
      const row = result[0] as unknown as { owner_email: string };
      expect(row.owner_email).toBe(ownerEmail);
    });
  });

  // --- GET /passports ---

  describe("GET /passports", () => {
    it("returns only owner's passports", async () => {
      // Register two passports for first owner
      await registerPassport({ name: "agent-1" });
      await registerPassport({ name: "agent-2" });

      // Register a different owner with a passport
      const otherRegisterRes = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "other@example.com",
          password: "secure-password-456",
          name: "Other Owner",
        }),
      });
      const { token: otherToken } = await otherRegisterRes.json();

      await app.request("/passports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${otherToken}`,
        },
        body: JSON.stringify({
          public_key: "MCowBQYDK2VwAyEAOtherKeyBase64UrlEncodedHere",
          name: "other-agent",
        }),
      });

      // Get passports for first owner
      const res = await app.request("/passports", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.passports).toHaveLength(2);
      expect(data.total).toBe(2);
      expect(data.passports[0].owner_email).toBe(ownerEmail);
      expect(data.passports[1].owner_email).toBe(ownerEmail);
    });

    it("returns 401 without auth token", async () => {
      const res = await app.request("/passports");
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.code).toBe("AUTH_REQUIRED");
    });
  });

  // --- GET /passports/:id ---

  describe("GET /passports/:id", () => {
    it("returns passport data for a valid ID", async () => {
      const createRes = await registerPassport();
      const { passport_id } = await createRes.json();

      const res = await app.request(`/passports/${passport_id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.id).toBe(passport_id);
      expect(data.name).toBe("test-agent");
      expect(data.public_key).toBeDefined();
      expect(data.trust_score).toBe(0);
      expect(data.status).toBe("active");
    });

    it("returns 404 for non-existent passport", async () => {
      const res = await app.request("/passports/ap_000000000000", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.code).toBe("NOT_FOUND");
    });

    it("returns 401 without auth token", async () => {
      const createRes = await registerPassport();
      const { passport_id } = await createRes.json();

      const res = await app.request(`/passports/${passport_id}`);
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.code).toBe("AUTH_REQUIRED");
    });

    it("returns 403 when accessing another owner's passport", async () => {
      // Register first passport
      const createRes = await registerPassport();
      const { passport_id } = await createRes.json();

      // Register a different owner
      const registerRes = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "other@example.com",
          password: "secure-password-456",
          name: "Other Owner",
        }),
      });
      const { token: otherToken } = await registerRes.json();

      // Try to access first owner's passport with second owner's token
      const res = await app.request(`/passports/${passport_id}`, {
        headers: { Authorization: `Bearer ${otherToken}` },
      });
      expect(res.status).toBe(403);

      const data = await res.json();
      expect(data.code).toBe("FORBIDDEN");
    });
  });

  // --- DELETE /passports/:id ---

  describe("DELETE /passports/:id", () => {
    it("revokes an active passport", async () => {
      // Generate a real key pair for signature verification
      const keys = generateKeyPair();
      const createRes = await registerPassport({ public_key: keys.publicKey });
      const { passport_id } = await createRes.json();

      // Sign the passport ID with the private key
      const signature = sign(passport_id, keys.privateKey);

      const res = await app.request(`/passports/${passport_id}`, {
        method: "DELETE",
        headers: {
          "X-AgentPass-Signature": signature,
          Authorization: `Bearer ${authToken}`,
        },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.revoked).toBe(true);

      // Verify in database
      const result = await db`SELECT status FROM passports WHERE id = ${passport_id}`;
      const row = result[0] as unknown as { status: string };
      expect(row.status).toBe("revoked");
    });

    it("returns 401 when auth token is missing", async () => {
      const keys = generateKeyPair();
      const createRes = await registerPassport({ public_key: keys.publicKey });
      const { passport_id } = await createRes.json();
      const signature = sign(passport_id, keys.privateKey);

      const res = await app.request(`/passports/${passport_id}`, {
        method: "DELETE",
        headers: { "X-AgentPass-Signature": signature },
      });
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.code).toBe("AUTH_REQUIRED");
    });

    it("returns 401 when signature is missing", async () => {
      const createRes = await registerPassport();
      const { passport_id } = await createRes.json();

      const res = await app.request(`/passports/${passport_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.code).toBe("AUTH_REQUIRED");
    });

    it("returns 403 for invalid signature", async () => {
      const keys = generateKeyPair();
      const wrongKeys = generateKeyPair();
      const createRes = await registerPassport({ public_key: keys.publicKey });
      const { passport_id } = await createRes.json();

      // Sign with wrong key
      const signature = sign(passport_id, wrongKeys.privateKey);

      const res = await app.request(`/passports/${passport_id}`, {
        method: "DELETE",
        headers: {
          "X-AgentPass-Signature": signature,
          Authorization: `Bearer ${authToken}`,
        },
      });
      expect(res.status).toBe(403);

      const data = await res.json();
      expect(data.code).toBe("AUTH_FAILED");
    });

    it("returns 404 for non-existent passport", async () => {
      const keys = generateKeyPair();
      const fakeId = "ap_000000000000";
      const signature = sign(fakeId, keys.privateKey);

      const res = await app.request(`/passports/${fakeId}`, {
        method: "DELETE",
        headers: {
          "X-AgentPass-Signature": signature,
          Authorization: `Bearer ${authToken}`,
        },
      });
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.code).toBe("NOT_FOUND");
    });

    it("returns 409 if passport is already revoked", async () => {
      const keys = generateKeyPair();
      const createRes = await registerPassport({ public_key: keys.publicKey });
      const { passport_id } = await createRes.json();

      // Revoke once
      const signature1 = sign(passport_id, keys.privateKey);
      await app.request(`/passports/${passport_id}`, {
        method: "DELETE",
        headers: {
          "X-AgentPass-Signature": signature1,
          Authorization: `Bearer ${authToken}`,
        },
      });

      // Revoke again
      const signature2 = sign(passport_id, keys.privateKey);
      const res = await app.request(`/passports/${passport_id}`, {
        method: "DELETE",
        headers: {
          "X-AgentPass-Signature": signature2,
          Authorization: `Bearer ${authToken}`,
        },
      });
      expect(res.status).toBe(409);

      const data = await res.json();
      expect(data.code).toBe("ALREADY_REVOKED");
    });
  });
});
