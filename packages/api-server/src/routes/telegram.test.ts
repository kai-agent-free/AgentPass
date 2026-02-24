import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { Hono } from "hono";
import {
  createTelegramRouter,
  parseLinkFromUpdate,
  persistTelegramChatId,
  getTelegramChatId,
  getTelegramChatIdByEmail,
} from "./telegram.js";
import { createApp } from "../index.js";
import type { Sql } from "../db/schema.js";
import { initDatabase } from "../db/schema.js";

/* ------------------------------------------------------------------ */
/*  Unit tests for parseLinkFromUpdate (no DB needed)                  */
/* ------------------------------------------------------------------ */
describe("parseLinkFromUpdate", () => {
  it("parses /start link_<email>", () => {
    const update = {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 123456, type: "private" },
        from: { id: 123456, first_name: "Test" },
        date: Date.now(),
        text: "/start link_user@example.com",
      },
    };
    expect(parseLinkFromUpdate(update)).toEqual({
      email: "user@example.com",
      chatId: "123456",
    });
  });

  it("parses /link <email>", () => {
    const update = {
      update_id: 2,
      message: {
        message_id: 2,
        chat: { id: 789, type: "private" },
        from: { id: 789, first_name: "Test" },
        date: Date.now(),
        text: "/link alice@test.org",
      },
    };
    expect(parseLinkFromUpdate(update)).toEqual({
      email: "alice@test.org",
      chatId: "789",
    });
  });

  it("returns null for invalid email", () => {
    const update = {
      update_id: 3,
      message: {
        message_id: 3,
        chat: { id: 1, type: "private" },
        from: { id: 1, first_name: "X" },
        date: Date.now(),
        text: "/start link_not-an-email",
      },
    };
    expect(parseLinkFromUpdate(update)).toBeNull();
  });

  it("returns null for plain /start", () => {
    const update = {
      update_id: 4,
      message: {
        message_id: 4,
        chat: { id: 1, type: "private" },
        from: { id: 1, first_name: "X" },
        date: Date.now(),
        text: "/start",
      },
    };
    expect(parseLinkFromUpdate(update)).toBeNull();
  });

  it("returns null for non-message updates", () => {
    expect(parseLinkFromUpdate({ update_id: 5 })).toBeNull();
  });

  it("handles URL-encoded email in /start", () => {
    const update = {
      update_id: 6,
      message: {
        message_id: 6,
        chat: { id: 42, type: "private" },
        from: { id: 42, first_name: "X" },
        date: Date.now(),
        text: "/start link_user%2Btag@example.com",
      },
    };
    const result = parseLinkFromUpdate(update);
    expect(result).toEqual({ email: "user+tag@example.com", chatId: "42" });
  });
});

/* ------------------------------------------------------------------ */
/*  Stateless route tests (no DB)                                      */
/* ------------------------------------------------------------------ */
describe("Telegram Routes (no DB)", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    const telegramRouter = createTelegramRouter();
    app.route("/telegram", telegramRouter);
  });

  describe("POST /telegram/webhook", () => {
    it("should accept webhook updates", async () => {
      const res = await app.request("/telegram/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          update_id: 12345,
          message: {
            message_id: 1,
            from: { id: 123, first_name: "Test" },
            chat: { id: 123, type: "private" },
            date: Date.now(),
            text: "/start",
          },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ ok: true });
    });
  });

  describe("GET /telegram/link/:email", () => {
    it("should generate deep link for valid email", async () => {
      const res = await app.request("/telegram/link/user@example.com");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty("email", "user@example.com");
      expect(json).toHaveProperty("link");
      expect(json.link).toContain("t.me/");
      expect(json.link).toContain("start=link_");
      expect(json).toHaveProperty("instructions");
    });

    it("should reject invalid email format", async () => {
      const res = await app.request("/telegram/link/invalid-email");

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toHaveProperty("error", "Invalid email format");
      expect(json).toHaveProperty("code", "INVALID_EMAIL");
    });

    it("should URL-encode email in deep link", async () => {
      const res = await app.request("/telegram/link/user+test@example.com");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.link).toContain(encodeURIComponent("user+test@example.com"));
    });
  });

  describe("GET /telegram/status", () => {
    it("should return status when bot is disabled", async () => {
      delete process.env.TELEGRAM_BOT_TOKEN;

      const res = await app.request("/telegram/status");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty("enabled", false);
      expect(json.message).toContain("disabled");
    });

    it("should return bot username when enabled", async () => {
      const originalToken = process.env.TELEGRAM_BOT_TOKEN;
      process.env.TELEGRAM_BOT_TOKEN = "test_token";

      const res = await app.request("/telegram/status");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty("enabled", true);
      expect(json).toHaveProperty("bot_username");

      if (originalToken) {
        process.env.TELEGRAM_BOT_TOKEN = originalToken;
      } else {
        delete process.env.TELEGRAM_BOT_TOKEN;
      }
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Integration tests with DB                                          */
/* ------------------------------------------------------------------ */
describe("Telegram Routes (with DB)", () => {
  let app: Hono;
  let db: Sql;
  const ownerEmail = `tgtest${Date.now()}@example.com`;
  const ownerPass = "TestPass123!";

  async function registerAndLogin(): Promise<string> {
    const regRes = await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ownerEmail, password: ownerPass, name: "TG Tester" }),
    });
    if (regRes.status !== 201 && regRes.status !== 409) {
      throw new Error(`Register failed: ${regRes.status}`);
    }

    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ownerEmail, password: ownerPass }),
    });
    const data = await loginRes.json();
    return data.token;
  }

  beforeEach(async () => {
    if (!process.env.DATABASE_URL) {
      console.warn("DATABASE_URL not set - skipping DB tests");
      return;
    }

    const created = await createApp(process.env.DATABASE_URL);
    app = created.app;
    db = created.db;

    // Clean up
    await db`DELETE FROM owner_settings WHERE owner_id IN (SELECT id FROM owners WHERE email = ${ownerEmail})`;
    await db`DELETE FROM api_keys WHERE owner_id IN (SELECT id FROM owners WHERE email = ${ownerEmail})`;
    await db`DELETE FROM owners WHERE email = ${ownerEmail}`;
  });

  afterEach(async () => {
    if (db) {
      await db`DELETE FROM owner_settings WHERE owner_id IN (SELECT id FROM owners WHERE email = ${ownerEmail})`;
      await db`DELETE FROM api_keys WHERE owner_id IN (SELECT id FROM owners WHERE email = ${ownerEmail})`;
      await db`DELETE FROM owners WHERE email = ${ownerEmail}`;
      await db.end();
    }
  });

  describe("POST /telegram/webhook — link via deep link", () => {
    it("persists chat ID when /start link_<email> matches an owner", async () => {
      // Register first
      const token = await registerAndLogin();

      const res = await app.request("/telegram/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          update_id: 100,
          message: {
            message_id: 1,
            from: { id: 55555, first_name: "User" },
            chat: { id: 55555, type: "private" },
            date: Date.now(),
            text: `/start link_${ownerEmail}`,
          },
        }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });

      // Verify persisted
      const chatId = await getTelegramChatIdByEmail(db, ownerEmail);
      expect(chatId).toBe("55555");
    });

    it("persists chat ID when /link <email> matches an owner", async () => {
      await registerAndLogin();

      const res = await app.request("/telegram/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          update_id: 101,
          message: {
            message_id: 2,
            from: { id: 77777, first_name: "User2" },
            chat: { id: 77777, type: "private" },
            date: Date.now(),
            text: `/link ${ownerEmail}`,
          },
        }),
      });

      expect(res.status).toBe(200);
      const chatId = await getTelegramChatIdByEmail(db, ownerEmail);
      expect(chatId).toBe("77777");
    });

    it("returns ok even if owner email not found", async () => {
      const res = await app.request("/telegram/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          update_id: 102,
          message: {
            message_id: 3,
            from: { id: 99, first_name: "X" },
            chat: { id: 99, type: "private" },
            date: Date.now(),
            text: "/start link_unknown@nowhere.com",
          },
        }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });
  });

  describe("POST /telegram/link (authenticated)", () => {
    it("links chat ID for authenticated owner", async () => {
      const token = await registerAndLogin();

      const res = await app.request("/telegram/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chat_id: "12345" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ ok: true, chat_id: "12345" });

      const chatId = await getTelegramChatIdByEmail(db, ownerEmail);
      expect(chatId).toBe("12345");
    });

    it("rejects missing chat_id", async () => {
      const token = await registerAndLogin();

      const res = await app.request("/telegram/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it("rejects unauthenticated request", async () => {
      const res = await app.request("/telegram/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: "12345" }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /telegram/link (authenticated)", () => {
    it("unlinks Telegram chat ID", async () => {
      const token = await registerAndLogin();

      // First link
      await app.request("/telegram/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chat_id: "99999" }),
      });

      // Verify linked
      let chatId = await getTelegramChatIdByEmail(db, ownerEmail);
      expect(chatId).toBe("99999");

      // Unlink
      const res = await app.request("/telegram/link", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      chatId = await getTelegramChatIdByEmail(db, ownerEmail);
      expect(chatId).toBeNull();
    });
  });

  describe("GET /telegram/chat-id (authenticated)", () => {
    it("returns linked chat ID", async () => {
      const token = await registerAndLogin();

      // Link first
      await app.request("/telegram/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chat_id: "44444" }),
      });

      const res = await app.request("/telegram/chat-id", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ chat_id: "44444", linked: true });
    });

    it("returns null when not linked", async () => {
      const token = await registerAndLogin();

      const res = await app.request("/telegram/chat-id", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ chat_id: null, linked: false });
    });
  });

  describe("DB helper: persistTelegramChatId", () => {
    it("returns false for unknown email", async () => {
      const result = await persistTelegramChatId(db, "nobody@nothing.com", "111");
      expect(result).toBe(false);
    });

    it("upserts on repeated calls", async () => {
      await registerAndLogin();
      await persistTelegramChatId(db, ownerEmail, "aaa");
      let chatId = await getTelegramChatIdByEmail(db, ownerEmail);
      expect(chatId).toBe("aaa");

      await persistTelegramChatId(db, ownerEmail, "bbb");
      chatId = await getTelegramChatIdByEmail(db, ownerEmail);
      expect(chatId).toBe("bbb");
    });
  });
});
