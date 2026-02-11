/**
 * Health and readiness check endpoints for AgentPass API Server.
 *
 * - GET /health  — always returns 200 with uptime and version.
 * - GET /ready   — returns 200 only when the database is accessible.
 */

import { Hono } from "hono";
import type { Client } from "@libsql/client";

const VERSION = "0.1.0";
const startTime = Date.now();

/**
 * Create the health-check router.
 *
 * @param db - The @libsql/client Client instance used for readiness probing.
 */
export function createHealthRouter(db: Client) {
  const router = new Hono();

  router.get("/health", (c) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    return c.json({
      status: "ok",
      version: VERSION,
      uptime_seconds: uptimeSeconds,
    });
  });

  router.get("/ready", async (c) => {
    try {
      // Lightweight probe: execute a no-op query
      await db.execute("SELECT 1");
      return c.json({ ready: true });
    } catch {
      return c.json({ ready: false, error: "database unavailable" }, 503);
    }
  });

  return router;
}
