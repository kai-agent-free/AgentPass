import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Client } from "@libsql/client";
import type { Hono } from "hono";
import { createApp } from "../index.js";

describe("Passport routes", () => {
  let app: Hono;
  let db: Client;

  beforeEach(async () => {
    const created = await createApp(":memory:");
    app = created.app;
    db = created.db;
  });

  afterEach(() => {
    db.close();
  });

  // --- Helper ---
  async function registerPassport(overrides: Record<string, unknown> = {}) {
    const body = {
      public_key: "MCowBQYDK2VwAyEATestKeyBase64UrlEncodedHere12345",
      owner_email: "owner@example.com",
      name: "test-agent",
      description: "A test agent passport",
      ...overrides,
    };
    const res = await app.request("/passports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

      const result = await db.execute({
        sql: "SELECT * FROM passports WHERE id = ?",
        args: [data.passport_id],
      });
      const row = result.rows[0] as unknown as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.name).toBe("test-agent");
      expect(row.status).toBe("active");
      expect(row.trust_score).toBe(0);
    });

    it("returns 400 for missing required fields", async () => {
      const res = await app.request("/passports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_key: "abc" }),
      });
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
      expect(data.details).toBeDefined();
    });

    it("returns 400 for invalid email", async () => {
      const res = await registerPassport({ owner_email: "not-an-email" });
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
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
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe("INVALID_JSON");
    });
  });

  // --- GET /passports/:id ---

  describe("GET /passports/:id", () => {
    it("returns passport data for a valid ID", async () => {
      const createRes = await registerPassport();
      const { passport_id } = await createRes.json();

      const res = await app.request(`/passports/${passport_id}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.id).toBe(passport_id);
      expect(data.name).toBe("test-agent");
      expect(data.public_key).toBeDefined();
      expect(data.trust_score).toBe(0);
      expect(data.status).toBe("active");
    });

    it("returns 404 for non-existent passport", async () => {
      const res = await app.request("/passports/ap_000000000000");
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.code).toBe("NOT_FOUND");
    });
  });

  // --- DELETE /passports/:id ---

  describe("DELETE /passports/:id", () => {
    it("revokes an active passport", async () => {
      const createRes = await registerPassport();
      const { passport_id } = await createRes.json();

      const res = await app.request(`/passports/${passport_id}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.revoked).toBe(true);

      // Verify in database
      const result = await db.execute({
        sql: "SELECT status FROM passports WHERE id = ?",
        args: [passport_id],
      });
      const row = result.rows[0] as unknown as { status: string };
      expect(row.status).toBe("revoked");
    });

    it("returns 404 for non-existent passport", async () => {
      const res = await app.request("/passports/ap_000000000000", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.code).toBe("NOT_FOUND");
    });

    it("returns 409 if passport is already revoked", async () => {
      const createRes = await registerPassport();
      const { passport_id } = await createRes.json();

      // Revoke once
      await app.request(`/passports/${passport_id}`, { method: "DELETE" });

      // Revoke again
      const res = await app.request(`/passports/${passport_id}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(409);

      const data = await res.json();
      expect(data.code).toBe("ALREADY_REVOKED");
    });
  });
});
