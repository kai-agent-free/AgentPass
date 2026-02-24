import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Sql } from "../db/schema.js";
import type { Hono } from "hono";
import { createApp } from "../index.js";

describe("Trust routes", () => {
  let app: Hono;
  let db: Sql;
  let authToken: string;

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
  });

  afterEach(async () => {
    await db.end();
  });

  // --- Helper ---
  async function registerPassport(overrides: Record<string, unknown> = {}) {
    const body = {
      public_key: "MCowBQYDK2VwAyEATestKeyBase64UrlEncodedHere12345",
      name: "trust-test-agent",
      description: "Agent for trust tests",
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
    const data = await res.json();
    return data.passport_id as string;
  }

  // --- GET /passports/:id/trust ---

  describe("GET /passports/:id/trust", () => {
    it("returns trust details for an existing passport", async () => {
      const passportId = await registerPassport();

      const res = await app.request(`/passports/${passportId}/trust`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.passport_id).toBe(passportId);
      expect(data.trust_score).toBe(0);
      expect(data.trust_level).toBe("unverified");
      expect(data.factors).toBeDefined();
      expect(data.factors.owner_verified).toBe(false);
      expect(data.factors.payment_method).toBe(false);
      expect(data.factors.abuse_reports).toBe(0);
      expect(data.factors.successful_auths).toBe(0);
    });

    it("returns 404 for a non-existent passport", async () => {
      const res = await app.request("/passports/ap_000000000000/trust", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.code).toBe("NOT_FOUND");
    });

    it("reflects owner_verified from metadata", async () => {
      const passportId = await registerPassport();

      // Manually set metadata to mark owner as verified
      await db`UPDATE passports SET metadata = ${{ owner_verified: true }} WHERE id = ${passportId}`;

      const res = await app.request(`/passports/${passportId}/trust`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();

      expect(data.factors.owner_verified).toBe(true);
      expect(data.trust_score).toBe(30);
      expect(data.trust_level).toBe("basic");
    });

    it("reflects payment_method from metadata", async () => {
      const passportId = await registerPassport();

      await db`UPDATE passports SET metadata = ${{ owner_verified: true, payment_method: true }} WHERE id = ${passportId}`;

      const res = await app.request(`/passports/${passportId}/trust`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();

      expect(data.factors.owner_verified).toBe(true);
      expect(data.factors.payment_method).toBe(true);
      expect(data.trust_score).toBe(50);
      expect(data.trust_level).toBe("verified");
    });
  });

  // --- POST /passports/:id/report-abuse ---

  describe("POST /passports/:id/report-abuse", () => {
    it("increments abuse count and recalculates trust score", async () => {
      const passportId = await registerPassport();

      const res = await app.request(`/passports/${passportId}/report-abuse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ reason: "Spamming service endpoints" }),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.passport_id).toBe(passportId);
      expect(data.abuse_reports).toBe(1);
      expect(data.trust_score).toBe(0); // 0 - 50 = -50, clamped to 0
    });

    it("accumulates multiple abuse reports", async () => {
      const passportId = await registerPassport();

      // Set some base score via metadata
      await db`UPDATE passports SET metadata = ${{ owner_verified: true, payment_method: true }} WHERE id = ${passportId}`;

      // First report
      await app.request(`/passports/${passportId}/report-abuse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ reason: "First offense" }),
      });

      // Second report
      const res = await app.request(`/passports/${passportId}/report-abuse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ reason: "Second offense" }),
      });

      const data = await res.json();
      expect(data.abuse_reports).toBe(2);
      // 30 + 20 = 50, minus 2*50 = 100 penalty -> -50, clamped to 0
      expect(data.trust_score).toBe(0);
    });

    it("persists abuse report in database metadata", async () => {
      const passportId = await registerPassport();

      await app.request(`/passports/${passportId}/report-abuse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ reason: "Automated credential stuffing" }),
      });

      const result = await db`SELECT metadata FROM passports WHERE id = ${passportId}`;
      const row = result[0] as unknown as { metadata: string };
      const metadata = JSON.parse(row.metadata);

      expect(metadata.abuse_reports).toBe(1);
      expect(metadata.abuse_reasons).toContain("Automated credential stuffing");
    });

    it("updates the trust_score column in the database", async () => {
      const passportId = await registerPassport();

      // Give passport some score first
      await db`UPDATE passports SET metadata = ${{ owner_verified: true }}, trust_score = 30 WHERE id = ${passportId}`;

      await app.request(`/passports/${passportId}/report-abuse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ reason: "Abuse" }),
      });

      const result = await db`SELECT trust_score FROM passports WHERE id = ${passportId}`;
      const row = result[0] as unknown as { trust_score: number };
      // 30 (verified) - 50 (1 report) = -20, clamped to 0
      expect(row.trust_score).toBe(0);
    });

    it("returns 404 for a non-existent passport", async () => {
      const res = await app.request("/passports/ap_000000000000/report-abuse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ reason: "Some reason" }),
      });

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.code).toBe("NOT_FOUND");
    });

    it("returns 400 when reason is missing", async () => {
      const passportId = await registerPassport();

      const res = await app.request(`/passports/${passportId}/report-abuse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("returns trust_level in the response", async () => {
      const passportId = await registerPassport();

      // Give the passport a high base score
      await db`UPDATE passports SET metadata = ${{ owner_verified: true, payment_method: true }} WHERE id = ${passportId}`;

      const res = await app.request(`/passports/${passportId}/report-abuse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ reason: "Minor issue" }),
      });

      const data = await res.json();
      // 30 + 20 - 50 = 0
      expect(data.trust_level).toBe("unverified");
    });
  });
});
