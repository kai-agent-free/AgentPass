/**
 * Audit log routes.
 *
 * POST /passports/:id/audit — append an audit entry
 * GET  /passports/:id/audit — list audit entries with pagination
 */

import crypto from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { Client } from "@libsql/client";
import { zValidator, getValidatedBody } from "../middleware/validation.js";

// --- Zod schemas ---

const AppendAuditSchema = z.object({
  action: z.string().min(1, "Action is required"),
  service: z.string().optional().default(""),
  method: z.string().optional().default(""),
  result: z.enum(["success", "failure", "pending_approval", "resolved_by_owner"]).default("success"),
  duration_ms: z.number().int().min(0).optional().default(0),
  details: z.record(z.unknown()).optional(),
});

type AppendAuditBody = z.infer<typeof AppendAuditSchema>;

// --- Row types ---

interface AuditRow {
  id: string;
  passport_id: string;
  action: string;
  service: string;
  method: string;
  result: string;
  duration_ms: number;
  details: string | null;
  created_at: string;
}

/**
 * Create the audit router bound to the given database instance.
 */
export function createAuditRouter(db: Client): Hono {
  const router = new Hono();

  /**
   * Check that the passport exists. Returns false if not found.
   */
  async function passportExists(passportId: string): Promise<boolean> {
    const result = await db.execute({
      sql: "SELECT id FROM passports WHERE id = ?",
      args: [passportId],
    });
    return result.rows.length > 0;
  }

  // GET /audit — list all audit entries across all passports with pagination
  router.get("/audit", async (c) => {
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(c.req.query("offset") || "0", 10) || 0, 0);

    const rowsResult = await db.execute({
      sql: "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?",
      args: [limit, offset],
    });
    const rows = rowsResult.rows as unknown as AuditRow[];

    const totalResult = await db.execute({
      sql: "SELECT COUNT(*) as count FROM audit_log",
      args: [],
    });
    const totalRow = totalResult.rows[0] as unknown as { count: number };

    const entries = rows.map((row) => ({
      id: row.id,
      passport_id: row.passport_id,
      action: row.action,
      service: row.service,
      method: row.method,
      result: row.result,
      duration_ms: row.duration_ms,
      details: row.details ? JSON.parse(row.details) : null,
      created_at: row.created_at,
    }));

    return c.json({
      entries,
      total: totalRow.count,
      limit,
      offset,
    });
  });

  // POST /passports/:id/audit — append audit entry
  router.post("/passports/:id/audit", zValidator(AppendAuditSchema), async (c) => {
    const passportId = c.req.param("id");

    if (!(await passportExists(passportId))) {
      return c.json(
        { error: "Passport not found", code: "NOT_FOUND" },
        404,
      );
    }

    const body = getValidatedBody<AppendAuditBody>(c);
    const entryId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO audit_log (id, passport_id, action, service, method, result, duration_ms, details, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        entryId,
        passportId,
        body.action,
        body.service,
        body.method,
        body.result,
        body.duration_ms,
        body.details ? JSON.stringify(body.details) : null,
        now,
      ],
    });

    return c.json({ id: entryId, created_at: now }, 201);
  });

  // GET /passports/:id/audit — list audit entries with pagination
  router.get("/passports/:id/audit", async (c) => {
    const passportId = c.req.param("id");

    if (!(await passportExists(passportId))) {
      return c.json(
        { error: "Passport not found", code: "NOT_FOUND" },
        404,
      );
    }

    const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(c.req.query("offset") || "0", 10) || 0, 0);

    const rowsResult = await db.execute({
      sql: "SELECT * FROM audit_log WHERE passport_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      args: [passportId, limit, offset],
    });
    const rows = rowsResult.rows as unknown as AuditRow[];

    const totalResult = await db.execute({
      sql: "SELECT COUNT(*) as count FROM audit_log WHERE passport_id = ?",
      args: [passportId],
    });
    const totalRow = totalResult.rows[0] as unknown as { count: number };

    const entries = rows.map((row) => ({
      id: row.id,
      passport_id: row.passport_id,
      action: row.action,
      service: row.service,
      method: row.method,
      result: row.result,
      duration_ms: row.duration_ms,
      details: row.details ? JSON.parse(row.details) : null,
      created_at: row.created_at,
    }));

    return c.json({
      entries,
      total: totalRow.count,
      limit,
      offset,
    });
  });

  return router;
}
