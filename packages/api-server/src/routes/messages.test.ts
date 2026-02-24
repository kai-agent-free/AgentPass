import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Sql } from "../db/schema.js";
import type { Hono } from "hono";
import { createApp } from "../index.js";

describe("Messages routes", () => {
  let app: Hono;
  let db: Sql;
  let authToken: string;
  let authToken2: string;
  let passportId: string;
  let passportId2: string;

  beforeEach(async () => {
    const created = await createApp(process.env.DATABASE_URL || "postgresql://localhost:5432/agentpass_test");
    app = created.app;
    db = created.db;

    await db`TRUNCATE TABLE messages, browser_commands, browser_sessions, escalations, approvals, api_keys, audit_log, passports, owners CASCADE`;

    // Register owner 1
    const reg1 = await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner1@example.com", password: "secure-password-123", name: "Owner One" }),
    });
    const data1 = await reg1.json();
    authToken = data1.token;

    // Register owner 2
    const reg2 = await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner2@example.com", password: "secure-password-456", name: "Owner Two" }),
    });
    const data2 = await reg2.json();
    authToken2 = data2.token;

    // Create passport for owner 1
    const p1 = await app.request("/passports", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ public_key: "key1abc", name: "agent-one" }),
    });
    passportId = (await p1.json()).passport_id;

    // Create passport for owner 2
    const p2 = await app.request("/passports", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken2}` },
      body: JSON.stringify({ public_key: "key2abc", name: "agent-two" }),
    });
    passportId2 = (await p2.json()).passport_id;
  });

  afterEach(async () => {
    await db.end();
  });

  async function sendMessage(token: string, body: Record<string, unknown>) {
    return app.request("/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }

  describe("POST /messages", () => {
    it("sends a message between agents", async () => {
      const res = await sendMessage(authToken, {
        from_passport_id: passportId,
        to_passport_id: passportId2,
        subject: "Hello",
        body: "Hi agent two!",
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBeDefined();
      expect(data.from_passport_id).toBe(passportId);
      expect(data.to_passport_id).toBe(passportId2);
    });

    it("rejects if sender does not own from_passport", async () => {
      const res = await sendMessage(authToken2, {
        from_passport_id: passportId, // owned by owner1
        to_passport_id: passportId2,
        body: "Impersonation attempt",
      });
      expect(res.status).toBe(403);
    });

    it("rejects if recipient passport does not exist", async () => {
      const res = await sendMessage(authToken, {
        from_passport_id: passportId,
        to_passport_id: "ap_nonexistent0",
        body: "To nobody",
      });
      expect(res.status).toBe(404);
    });

    it("rejects empty body", async () => {
      const res = await sendMessage(authToken, {
        from_passport_id: passportId,
        to_passport_id: passportId2,
        body: "",
      });
      expect(res.status).toBe(400);
    });

    it("requires auth", async () => {
      const res = await app.request("/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_passport_id: passportId, to_passport_id: passportId2, body: "No auth" }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /messages", () => {
    it("lists inbox messages for a passport", async () => {
      await sendMessage(authToken, {
        from_passport_id: passportId,
        to_passport_id: passportId2,
        subject: "Test",
        body: "Message content",
      });

      const res = await app.request(`/messages?passport_id=${passportId2}`, {
        headers: { Authorization: `Bearer ${authToken2}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.messages).toHaveLength(1);
      expect(data.messages[0].body).toBe("Message content");
    });

    it("requires passport_id query param", async () => {
      const res = await app.request("/messages", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(400);
    });

    it("rejects if not owner of passport", async () => {
      const res = await app.request(`/messages?passport_id=${passportId}`, {
        headers: { Authorization: `Bearer ${authToken2}` },
      });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /messages/:id", () => {
    it("returns message and marks as read", async () => {
      const sendRes = await sendMessage(authToken, {
        from_passport_id: passportId,
        to_passport_id: passportId2,
        body: "Read me",
      });
      const { id } = await sendRes.json();

      const res = await app.request(`/messages/${id}`, {
        headers: { Authorization: `Bearer ${authToken2}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.body).toBe("Read me");
      expect(data.read).toBe(true);
    });

    it("returns 404 for non-existent message", async () => {
      const res = await app.request(`/messages/${crypto.randomUUID()}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /messages/:id", () => {
    it("deletes a message as recipient", async () => {
      const sendRes = await sendMessage(authToken, {
        from_passport_id: passportId,
        to_passport_id: passportId2,
        body: "Delete me",
      });
      const { id } = await sendRes.json();

      const res = await app.request(`/messages/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken2}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.deleted).toBe(true);
    });

    it("sender cannot delete", async () => {
      const sendRes = await sendMessage(authToken, {
        from_passport_id: passportId,
        to_passport_id: passportId2,
        body: "Try delete",
      });
      const { id } = await sendRes.json();

      const res = await app.request(`/messages/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(404);
    });
  });
});
