import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Client } from "@libsql/client";
import type { Hono } from "hono";
import { createApp } from "../index.js";

describe("Health endpoints", () => {
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

  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);

      const data = (await res.json()) as Record<string, unknown>;
      expect(data.status).toBe("ok");
    });

    it("includes version field", async () => {
      const res = await app.request("/health");
      const data = (await res.json()) as Record<string, unknown>;
      expect(data.version).toBe("0.1.0");
    });

    it("includes uptime_seconds as a number", async () => {
      const res = await app.request("/health");
      const data = (await res.json()) as Record<string, unknown>;
      expect(typeof data.uptime_seconds).toBe("number");
      expect(data.uptime_seconds).toBeGreaterThanOrEqual(0);
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
      db.close();
      const res = await app.request("/ready");
      expect(res.status).toBe(503);

      const data = (await res.json()) as Record<string, unknown>;
      expect(data.ready).toBe(false);
    });
  });
});
