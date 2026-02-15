/**
 * CAPTCHA escalation routes.
 *
 * Agent detects CAPTCHA -> creates escalation -> owner resolves in Dashboard -> agent continues.
 *
 * POST /escalations              -- create a new CAPTCHA escalation
 * GET  /escalations              -- list escalations for owner's passports
 * GET  /escalations/:id          -- get single escalation (for solver page)
 * POST /escalations/:id/resolve  -- mark escalation as resolved by owner
 */

import crypto from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { Sql } from "../db/schema.js";
import { zValidator, getValidatedBody } from "../middleware/validation.js";
import { requireAuth, type OwnerPayload, type AuthVariables } from "../middleware/auth.js";

// --- Zod schemas ---

const CreateEscalationSchema = z.object({
  passport_id: z.string().min(1, "Passport ID is required"),
  captcha_type: z.string().min(1, "CAPTCHA type is required"),
  service: z.string().min(1, "Service is required"),
  screenshot: z.string().optional(),
});

type CreateEscalationBody = z.infer<typeof CreateEscalationSchema>;

// --- Row types ---

interface EscalationRow {
  id: string;
  passport_id: string;
  captcha_type: string;
  service: string;
  screenshot: string | null;
  status: string;
  created_at: Date;
  resolved_at: Date | null;
}

function mapEscalationRow(row: EscalationRow) {
  return {
    id: row.id,
    passport_id: row.passport_id,
    captcha_type: row.captcha_type,
    service: row.service,
    screenshot: row.screenshot,
    status: row.status,
    created_at: row.created_at.toISOString(),
    resolved_at: row.resolved_at?.toISOString() ?? null,
  };
}

/**
 * Create the escalations router bound to the given database instance.
 */
export function createEscalationsRouter(db: Sql): Hono<{ Variables: AuthVariables }> {
  const router = new Hono<{ Variables: AuthVariables }>();

  // POST / -- create a new CAPTCHA escalation
  router.post("/", requireAuth(db), zValidator(CreateEscalationSchema), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const body = getValidatedBody<CreateEscalationBody>(c);

    // Verify passport belongs to the authenticated owner
    const passportRows = await db<{ owner_email: string }[]>`
      SELECT owner_email FROM passports WHERE id = ${body.passport_id}
    `;

    if (passportRows.length === 0) {
      return c.json(
        { error: "Passport not found", code: "NOT_FOUND" },
        404,
      );
    }

    if (passportRows[0].owner_email !== owner.email) {
      return c.json(
        { error: "Access denied", code: "FORBIDDEN" },
        403,
      );
    }

    const escalationId = crypto.randomUUID();

    const result = await db<{ created_at: Date }[]>`
      INSERT INTO escalations (id, passport_id, captcha_type, service, screenshot)
      VALUES (${escalationId}, ${body.passport_id}, ${body.captcha_type}, ${body.service}, ${body.screenshot ?? null})
      RETURNING created_at
    `;

    return c.json(
      {
        escalation_id: escalationId,
        status: "pending",
        created_at: result[0].created_at.toISOString(),
      },
      201,
    );
  });

  // GET / -- list escalations for owner's passports
  router.get("/", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const statusFilter = c.req.query("status");

    let rows: EscalationRow[];

    if (statusFilter) {
      rows = await db<EscalationRow[]>`
        SELECT e.* FROM escalations e
        JOIN passports p ON e.passport_id = p.id
        WHERE p.owner_email = ${owner.email}
          AND e.status = ${statusFilter}
        ORDER BY
          CASE WHEN e.status = 'pending' THEN 0 ELSE 1 END,
          e.created_at DESC
      `;
    } else {
      rows = await db<EscalationRow[]>`
        SELECT e.* FROM escalations e
        JOIN passports p ON e.passport_id = p.id
        WHERE p.owner_email = ${owner.email}
        ORDER BY
          CASE WHEN e.status = 'pending' THEN 0 ELSE 1 END,
          e.created_at DESC
      `;
    }

    return c.json({
      escalations: rows.map(mapEscalationRow),
    });
  });

  // GET /:id -- get single escalation (for the solver page)
  router.get("/:id", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const escalationId = c.req.param("id");

    const rows = await db<(EscalationRow & { owner_email: string })[]>`
      SELECT e.*, p.owner_email FROM escalations e
      JOIN passports p ON e.passport_id = p.id
      WHERE e.id = ${escalationId}
    `;

    if (rows.length === 0) {
      return c.json(
        { error: "Escalation not found", code: "NOT_FOUND" },
        404,
      );
    }

    if (rows[0].owner_email !== owner.email) {
      return c.json(
        { error: "Access denied", code: "FORBIDDEN" },
        403,
      );
    }

    return c.json(mapEscalationRow(rows[0]));
  });

  // POST /:id/resolve -- mark escalation as resolved by owner
  router.post("/:id/resolve", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const escalationId = c.req.param("id");

    // Look up the escalation and verify it belongs to one of the owner's passports
    const rows = await db<(EscalationRow & { owner_email: string })[]>`
      SELECT e.*, p.owner_email FROM escalations e
      JOIN passports p ON e.passport_id = p.id
      WHERE e.id = ${escalationId}
    `;

    if (rows.length === 0) {
      return c.json(
        { error: "Escalation not found", code: "NOT_FOUND" },
        404,
      );
    }

    const escalation = rows[0];

    if (escalation.owner_email !== owner.email) {
      return c.json(
        { error: "Access denied", code: "FORBIDDEN" },
        403,
      );
    }

    if (escalation.status !== "pending") {
      return c.json(
        { error: "Escalation already resolved", code: "ALREADY_RESOLVED" },
        409,
      );
    }

    const result = await db<{ resolved_at: Date }[]>`
      UPDATE escalations
      SET status = 'resolved', resolved_at = NOW()
      WHERE id = ${escalationId}
      RETURNING resolved_at
    `;

    return c.json({
      status: "resolved",
      resolved_at: result[0].resolved_at.toISOString(),
    });
  });

  return router;
}
