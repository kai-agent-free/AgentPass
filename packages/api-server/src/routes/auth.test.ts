import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Client } from "@libsql/client";
import type { Hono } from "hono";
import { createApp } from "../index.js";

describe("Auth routes", () => {
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
  async function register(overrides: Record<string, unknown> = {}) {
    const body = {
      email: "test@example.com",
      password: "secure-password-123",
      name: "Test Owner",
      ...overrides,
    };
    const res = await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res;
  }

  async function login(email: string, password: string) {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return res;
  }

  // --- POST /auth/register ---

  describe("POST /auth/register", () => {
    it("creates an owner account and returns 201 with token", async () => {
      const res = await register();
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.owner_id).toBeDefined();
      expect(data.email).toBe("test@example.com");
      expect(data.name).toBe("Test Owner");
      expect(data.token).toBeDefined();
    });

    it("persists the owner in the database with hashed password", async () => {
      const res = await register();
      const data = await res.json();

      const result = await db.execute({
        sql: "SELECT * FROM owners WHERE id = ?",
        args: [data.owner_id],
      });
      const row = result.rows[0] as unknown as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.email).toBe("test@example.com");
      expect(row.name).toBe("Test Owner");
      expect(row.password_hash).toBeDefined();
      expect(row.password_hash).not.toBe("secure-password-123");
      expect(row.verified).toBe(0);
    });

    it("returns 409 for duplicate email", async () => {
      await register();
      const res = await register();
      expect(res.status).toBe(409);

      const data = await res.json();
      expect(data.code).toBe("EMAIL_EXISTS");
    });

    it("returns 400 for invalid email", async () => {
      const res = await register({ email: "not-an-email" });
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for weak password", async () => {
      const res = await register({ password: "short" });
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
      expect(data.details).toBeDefined();
    });

    it("returns 400 for missing name", async () => {
      const res = await register({ name: "" });
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });
  });

  // --- POST /auth/login ---

  describe("POST /auth/login", () => {
    it("returns 200 with token for valid credentials", async () => {
      const registerRes = await register();
      const registerData = await registerRes.json();

      const res = await login("test@example.com", "secure-password-123");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.owner_id).toBe(registerData.owner_id);
      expect(data.email).toBe("test@example.com");
      expect(data.name).toBe("Test Owner");
      expect(data.token).toBeDefined();
    });

    it("returns 401 for wrong password", async () => {
      await register();
      const res = await login("test@example.com", "wrong-password");
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.code).toBe("AUTH_FAILED");
    });

    it("returns 401 for non-existent email", async () => {
      const res = await login("nonexistent@example.com", "password");
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.code).toBe("AUTH_FAILED");
    });

    it("returns 400 for invalid email format", async () => {
      const res = await login("not-an-email", "password");
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });
  });

  // --- GET /auth/me ---

  describe("GET /auth/me", () => {
    it("returns owner info with valid token", async () => {
      const registerRes = await register();
      const { token, owner_id } = await registerRes.json();

      const res = await app.request("/auth/me", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.owner_id).toBe(owner_id);
      expect(data.email).toBe("test@example.com");
      expect(data.name).toBe("Test Owner");
      expect(data.verified).toBe(false);
      expect(data.created_at).toBeDefined();
    });

    it("returns 401 without token", async () => {
      const res = await app.request("/auth/me", {
        method: "GET",
      });
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.code).toBe("AUTH_REQUIRED");
    });

    it("returns 401 with invalid token", async () => {
      const res = await app.request("/auth/me", {
        method: "GET",
        headers: { Authorization: "Bearer invalid-token" },
      });
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.code).toBe("AUTH_INVALID");
    });

    it("returns 401 with malformed authorization header", async () => {
      const res = await app.request("/auth/me", {
        method: "GET",
        headers: { Authorization: "NotBearer token" },
      });
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.code).toBe("AUTH_REQUIRED");
    });
  });

  // --- POST /auth/logout ---

  describe("POST /auth/logout", () => {
    it("returns success", async () => {
      const res = await app.request("/auth/logout", {
        method: "POST",
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
    });
  });
});
