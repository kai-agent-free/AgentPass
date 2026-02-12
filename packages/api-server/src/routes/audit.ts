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
import { requireAuth, type OwnerPayload, type AuthVariables } from "../middleware/auth.js";

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
export function createAuditRouter(db: Client): Hono<{ Variables: AuthVariables }> {
  const router = new Hono<{ Variables: AuthVariables }>();

  /**
   * Check that the passport exists and belongs to the owner.
   * Returns the owner_email if found, null otherwise.
   */
  async function getPassportOwner(passportId: string): Promise<string | null> {
    const result = await db.execute({
      sql: "SELECT owner_email FROM passports WHERE id = ?",
      args: [passportId],
    });
    const row = result.rows[0] as unknown as { owner_email: string } | undefined;
    return row?.owner_email ?? null;
  }

  // GET /audit — list all audit entries for owner's passports with pagination
  router.get("/audit", requireAuth(), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(c.req.query("offset") || "0", 10) || 0, 0);

    // Filter audit entries by owner's passports
    const rowsResult = await db.execute({
      sql: `SELECT a.* FROM audit_log a
            JOIN passports p ON a.passport_id = p.id
            WHERE p.owner_email = ?
            ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      args: [owner.email, limit, offset],
    });
    const rows = rowsResult.rows as unknown as AuditRow[];

    const totalResult = await db.execute({
      sql: `SELECT COUNT(*) as count FROM audit_log a
            JOIN passports p ON a.passport_id = p.id
            WHERE p.owner_email = ?`,
      args: [owner.email],
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
  router.post("/passports/:id/audit", requireAuth(), zValidator(AppendAuditSchema), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const passportId = c.req.param("id");

    const ownerEmail = await getPassportOwner(passportId);
    if (!ownerEmail) {
      return c.json(
        { error: "Passport not found", code: "NOT_FOUND" },
        404,
      );
    }

    // Verify owner owns this passport
    if (ownerEmail !== owner.email) {
      return c.json(
        { error: "Access denied", code: "FORBIDDEN" },
        403,
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
  router.get("/passports/:id/audit", requireAuth(), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const passportId = c.req.param("id");

    const ownerEmail = await getPassportOwner(passportId);
    if (!ownerEmail) {
      return c.json(
        { error: "Passport not found", code: "NOT_FOUND" },
        404,
      );
    }

    // Verify owner owns this passport
    if (ownerEmail !== owner.email) {
      return c.json(
        { error: "Access denied", code: "FORBIDDEN" },
        403,
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
