/**
 * Owner settings routes.
 *
 * GET  /settings  - Get all settings for authenticated owner
 * PUT  /settings  - Update settings (accepts JSON object of key-value pairs)
 *
 * All routes require JWT or API key authentication.
 */

import { Hono } from "hono";
import type { Sql } from "../db/schema.js";
import { requireAuth, type OwnerPayload, type AuthVariables } from "../middleware/auth.js";

interface SettingRow {
  key: string;
  value: string;
  updated_at: Date;
}

export function createSettingsRouter(db: Sql): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();

  /**
   * GET /settings
   *
   * Returns all settings for the authenticated owner as a flat object.
   */
  app.get("/", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;

    const rows = await db<SettingRow[]>`
      SELECT key, value FROM owner_settings
      WHERE owner_id = ${owner.owner_id}
    `;

    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    return c.json({ settings });
  });

  /**
   * PUT /settings
   *
   * Accepts a JSON object { settings: { key: value, ... } }.
   * Upserts each key-value pair for the authenticated owner.
   */
  app.put("/", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const body = await c.req.json<{ settings: Record<string, string> }>();

    if (!body.settings || typeof body.settings !== "object") {
      return c.json({ error: "Missing settings object", code: "VALIDATION_ERROR" }, 400);
    }

    const entries = Object.entries(body.settings);

    if (entries.length === 0) {
      return c.json({ ok: true });
    }

    // Limit keys to prevent abuse
    if (entries.length > 50) {
      return c.json({ error: "Too many settings (max 50)", code: "VALIDATION_ERROR" }, 400);
    }

    // Validate key/value sizes
    for (const [key, value] of entries) {
      if (typeof key !== "string" || key.length > 255) {
        return c.json({ error: `Invalid key: ${key}`, code: "VALIDATION_ERROR" }, 400);
      }
      if (typeof value !== "string" || value.length > 4096) {
        return c.json({ error: `Value too long for key: ${key}`, code: "VALIDATION_ERROR" }, 400);
      }
    }

    // Upsert all settings
    for (const [key, value] of entries) {
      await db`
        INSERT INTO owner_settings (owner_id, key, value, updated_at)
        VALUES (${owner.owner_id}, ${key}, ${value}, NOW())
        ON CONFLICT (owner_id, key)
        DO UPDATE SET value = ${value}, updated_at = NOW()
      `;
    }

    return c.json({ ok: true });
  });

  return app;
}
