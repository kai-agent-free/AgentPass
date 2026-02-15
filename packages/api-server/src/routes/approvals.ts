/**
 * Approval request routes.
 *
 * GET  /approvals              — list approvals for owner's passports
 * POST /approvals              — create an approval request
 * POST /approvals/:id/respond  — approve or deny a request
 */

import crypto from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { Sql } from "../db/schema.js";
import { zValidator, getValidatedBody } from "../middleware/validation.js";
import { requireAuth, type OwnerPayload, type AuthVariables } from "../middleware/auth.js";

// --- Zod schemas ---

const CreateApprovalSchema = z.object({
  passport_id: z.string().min(1, "Passport ID is required"),
  action: z.string().min(1, "Action is required"),
  service: z.string().optional().default(""),
  details: z.string().optional().default(""),
});

type CreateApprovalBody = z.infer<typeof CreateApprovalSchema>;

const RespondApprovalSchema = z.object({
  approved: z.boolean({ required_error: "approved field is required" }),
});

type RespondApprovalBody = z.infer<typeof RespondApprovalSchema>;

// --- Row types ---

interface ApprovalRow {
  id: string;
  passport_id: string;
  action: string;
  service: string;
  details: string;
  status: string;
  responded_at: Date | null;
  created_at: Date;
}

function mapApprovalRow(row: ApprovalRow) {
  return {
    id: row.id,
    passport_id: row.passport_id,
    action: row.action,
    service: row.service,
    details: row.details,
    status: row.status,
    responded_at: row.responded_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  };
}

/**
 * Create the approvals router bound to the given database instance.
 */
export function createApprovalsRouter(db: Sql): Hono<{ Variables: AuthVariables }> {
  const router = new Hono<{ Variables: AuthVariables }>();

  // GET / — list approvals for owner's passports (pending first, then by created_at DESC)
  router.get("/", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const statusFilter = c.req.query("status");

    let rows: ApprovalRow[];

    if (statusFilter) {
      rows = await db<ApprovalRow[]>`
        SELECT a.* FROM approvals a
        JOIN passports p ON a.passport_id = p.id
        WHERE p.owner_email = ${owner.email}
          AND a.status = ${statusFilter}
        ORDER BY
          CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END,
          a.created_at DESC
      `;
    } else {
      rows = await db<ApprovalRow[]>`
        SELECT a.* FROM approvals a
        JOIN passports p ON a.passport_id = p.id
        WHERE p.owner_email = ${owner.email}
        ORDER BY
          CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END,
          a.created_at DESC
      `;
    }

    return c.json({
      approvals: rows.map(mapApprovalRow),
    });
  });

  // POST / — create an approval request
  router.post("/", requireAuth(db), zValidator(CreateApprovalSchema), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const body = getValidatedBody<CreateApprovalBody>(c);

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

    const approvalId = crypto.randomUUID();

    const result = await db<{ created_at: Date }[]>`
      INSERT INTO approvals (id, passport_id, action, service, details)
      VALUES (${approvalId}, ${body.passport_id}, ${body.action}, ${body.service}, ${body.details})
      RETURNING created_at
    `;

    return c.json(
      {
        id: approvalId,
        created_at: result[0].created_at.toISOString(),
      },
      201,
    );
  });

  // POST /:id/respond — approve or deny an approval request
  router.post("/:id/respond", requireAuth(db), zValidator(RespondApprovalSchema), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const approvalId = c.req.param("id");
    const body = getValidatedBody<RespondApprovalBody>(c);

    // Look up the approval and verify it belongs to one of the owner's passports
    const rows = await db<(ApprovalRow & { owner_email: string })[]>`
      SELECT a.*, p.owner_email FROM approvals a
      JOIN passports p ON a.passport_id = p.id
      WHERE a.id = ${approvalId}
    `;

    if (rows.length === 0) {
      return c.json(
        { error: "Approval not found", code: "NOT_FOUND" },
        404,
      );
    }

    const approval = rows[0];

    if (approval.owner_email !== owner.email) {
      return c.json(
        { error: "Access denied", code: "FORBIDDEN" },
        403,
      );
    }

    if (approval.status !== "pending") {
      return c.json(
        { error: "Approval already responded to", code: "ALREADY_RESPONDED" },
        409,
      );
    }

    const newStatus = body.approved ? "approved" : "denied";

    await db`
      UPDATE approvals
      SET status = ${newStatus}, responded_at = NOW()
      WHERE id = ${approvalId}
    `;

    return c.json({ status: newStatus });
  });

  return router;
}
