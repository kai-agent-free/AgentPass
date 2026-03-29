/**
 * Health and readiness check endpoints for AgentPass API Server.
 *
 * - GET /health  — always returns 200 with uptime and version.
 * - GET /ready   — returns 200 only when the database is accessible.
 */

import { Hono } from "hono";
import type { Sql } from "../db/schema.js";

/**
 * Create the health-check router.
 *
 * @param db - The postgres instance used for readiness probing.
 */
export function createHealthRouter(db: Sql) {
  const router = new Hono();

  router.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  router.get("/ready", async (c) => {
    try {
      // Lightweight probe: execute a no-op query
      await db`SELECT 1`;
      return c.json({ ready: true });
    } catch {
      return c.json({ ready: false, error: "database unavailable" }, 503);
    }
  });

  return router;
}
