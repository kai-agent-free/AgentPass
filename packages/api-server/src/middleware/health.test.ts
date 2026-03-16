import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Sql } from "../db/schema.js";
import type { Hono } from "hono";
import { createApp } from "../index.js";

describe("Health endpoints", () => {
  let app: Hono;
  let db: Sql;

  beforeEach(async () => {
    const created = await createApp(process.env.DATABASE_URL || "postgresql://localhost:5432/agentpass_test");
    app = created.app;
    db = created.db;
  });

  afterEach(async () => {
    await db.end();
  });

  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);

      const data = (await res.json()) as Record<string, unknown>;
      expect(data.status).toBe("ok");
    });

    it("does not leak version or uptime", async () => {
      const res = await app.request("/health");
      const data = (await res.json()) as Record<string, unknown>;
      expect(data).toEqual({ status: "ok" });
    });
  });

  describe("GET /ready", () => {
    it("returns 200 with ready: true when DB is accessible", async () => {
      const res = await app.request("/ready");
      expect(res.status).toBe(200);

      const data = (await res.json()) as Record<string, unknown>;
      expect(data.ready).toBe(true);
    });

    it("returns 503 with ready: false when DB is closed", async () => {
      await db.end();
      const res = await app.request("/ready");
      expect(res.status).toBe(503);

      const data = (await res.json()) as Record<string, unknown>;
      expect(data.ready).toBe(false);
    });
  });
});
