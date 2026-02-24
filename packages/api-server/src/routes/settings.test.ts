import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Sql } from "../db/schema.js";
import type { Hono } from "hono";
import { createApp } from "../index.js";

describe("Settings routes", () => {
  let app: Hono;
  let db: Sql;

  beforeEach(async () => {
    if (!process.env.DATABASE_URL) {
      console.warn("DATABASE_URL not set - skipping settings route tests");
      return;
    }

    const created = await createApp(process.env.DATABASE_URL);
    app = created.app;
    db = created.db;

    await db`TRUNCATE TABLE owner_settings, api_keys, audit_log, passports, owners CASCADE`;
  });

  afterEach(async () => {
    if (db) {
      await db.end();
    }
  });

  // --- Helpers ---
  async function registerAndLogin(): Promise<string> {
    await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "settings-test@example.com",
        password: "secure-password-123",
        name: "Settings Test",
      }),
    });

    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "settings-test@example.com",
        password: "secure-password-123",
      }),
    });

    const data = await loginRes.json();
    return data.token;
  }

  // --- GET /settings ---

  describe("GET /settings", () => {
    it("returns empty settings for new owner", async () => {
      const token = await registerAndLogin();

      const res = await app.request("/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.settings).toEqual({});
    });

    it("returns 401 without auth", async () => {
      const res = await app.request("/settings");
      expect(res.status).toBe(401);
    });
  });

  // --- PUT /settings ---

  describe("PUT /settings", () => {
    it("saves and retrieves settings", async () => {
      const token = await registerAndLogin();

      const putRes = await app.request("/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          settings: {
            webhookUrl: "https://example.com/webhook",
            telegramChatId: "123456",
          },
        }),
      });

      expect(putRes.status).toBe(200);
      const putData = await putRes.json();
      expect(putData.ok).toBe(true);

      // Verify retrieval
      const getRes = await app.request("/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const getData = await getRes.json();
      expect(getData.settings.webhookUrl).toBe("https://example.com/webhook");
      expect(getData.settings.telegramChatId).toBe("123456");
    });

    it("upserts existing keys", async () => {
      const token = await registerAndLogin();

      // First save
      await app.request("/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ settings: { webhookUrl: "https://old.com" } }),
      });

      // Update
      await app.request("/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ settings: { webhookUrl: "https://new.com" } }),
      });

      const getRes = await app.request("/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await getRes.json();
      expect(data.settings.webhookUrl).toBe("https://new.com");
    });

    it("returns 400 without settings object", async () => {
      const token = await registerAndLogin();

      const res = await app.request("/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ foo: "bar" }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const res = await app.request("/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { key: "value" } }),
      });

      expect(res.status).toBe(401);
    });

    it("isolates settings between owners", async () => {
      // Register first owner
      const token1 = await registerAndLogin();

      // Register second owner
      await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "other@example.com",
          password: "secure-password-123",
          name: "Other Owner",
        }),
      });
      const login2 = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "other@example.com", password: "secure-password-123" }),
      });
      const token2 = (await login2.json()).token;

      // Owner 1 saves settings
      await app.request("/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token1}` },
        body: JSON.stringify({ settings: { webhookUrl: "https://owner1.com" } }),
      });

      // Owner 2 should not see owner 1's settings
      const getRes = await app.request("/settings", {
        headers: { Authorization: `Bearer ${token2}` },
      });
      const data = await getRes.json();
      expect(data.settings).toEqual({});
    });
  });
});
