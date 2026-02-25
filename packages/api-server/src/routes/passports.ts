/**
 * Passport management routes.
 *
 * POST   /passports     - Register a new passport
 * GET    /passports/:id - Get passport info (public data only)
 * DELETE /passports/:id - Revoke a passport
 */

import { Hono } from "hono";
import { z } from "zod";
import { generatePassportId, verify } from "@agentpass/core";
import type { Sql } from "../db/schema.js";
import { zValidator, getValidatedBody } from "../middleware/validation.js";
import { rateLimiters } from "../middleware/rate-limiter.js";
import { requireAuth, type OwnerPayload, type AuthVariables } from "../middleware/auth.js";
import { getTrustLevel } from "../services/trust-score.js";

// --- Zod schemas for request validation ---

const RegisterPassportSchema = z.object({
  passport_id: z
    .string()
    .regex(
      /^ap_[a-z0-9]{12}$/,
      "Invalid passport ID format (expected ap_xxxxxxxxxxxx)",
    )
    .optional(),
  public_key: z.string().min(1, "Public key is required"),
  name: z
    .string()
    .min(1, "Name is required")
    .max(64, "Name must be 64 characters or fewer")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Name must contain only alphanumeric characters, hyphens, and underscores",
    ),
  description: z
    .string()
    .max(256, "Description must be 256 characters or fewer")
    .optional()
    .default(""),
  metadata: z
    .record(z.unknown())
    .optional()
    .default({}),
});

type RegisterPassportBody = z.infer<typeof RegisterPassportSchema>;

// --- Row type returned from SQLite ---

interface PassportRow {
  id: string;
  public_key: string;
  owner_email: string;
  name: string;
  type: string;
  description: string;
  trust_score: number;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Create the passports router bound to the given database instance.
 */
export function createPassportsRouter(db: Sql): Hono<{ Variables: AuthVariables }> {
  const router = new Hono<{ Variables: AuthVariables }>();

  // GET /passports — list all passports (filtered by owner)
  router.get("/", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(c.req.query("offset") || "0", 10) || 0, 0);

    const rows = await db<PassportRow[]>`
      SELECT * FROM passports
      WHERE owner_email = ${owner.email}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const totalRows = await db<{ count: number }[]>`
      SELECT COUNT(*) as count FROM passports WHERE owner_email = ${owner.email}
    `;
    const total = Number(totalRows[0].count);

    const passports = rows.map((row) => ({
      id: row.id,
      public_key: row.public_key,
      owner_email: row.owner_email,
      name: row.name,
      description: row.description,
      trust_score: row.trust_score,
      trust_level: getTrustLevel(row.trust_score),
      status: row.status,
      metadata: row.metadata,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    }));

    return c.json({
      passports,
      total,
      limit,
      offset,
    });
  });

  // POST /passports — register a new passport
  router.post("/", requireAuth(db), rateLimiters.createPassport, zValidator(RegisterPassportSchema), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const body = getValidatedBody<RegisterPassportBody>(c);

    // Use client-provided passport_id or generate server-side
    const passportId = body.passport_id ?? generatePassportId();

    // If client provided an ID, check uniqueness
    if (body.passport_id) {
      const existing = await db<{ id: string }[]>`
        SELECT id FROM passports WHERE id = ${passportId}
      `;
      if (existing.length > 0) {
        return c.json(
          { error: "Passport ID already exists", code: "CONFLICT" },
          409,
        );
      }
    }

    const defaultMetadata = JSON.stringify({
      ...body.metadata,
      owner_verified: false,
      payment_method: false,
      abuse_reports: 0,
      abuse_reasons: [],
    });

    const result = await db<{ created_at: Date }[]>`
      INSERT INTO passports (id, public_key, owner_email, name, description, trust_score, status, metadata)
      VALUES (${passportId}, ${body.public_key}, ${owner.email}, ${body.name}, ${body.description}, 0, 'active', ${defaultMetadata}::jsonb)
      RETURNING created_at
    `;

    const sanitizedName = body.name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const agentEmail = `${sanitizedName || "agent"}@agent-mail.xyz`;

    // Write audit log entry for passport creation
    const auditId = crypto.randomUUID();
    await db`
      INSERT INTO audit_log (id, passport_id, action, service, method, result, details)
      VALUES (
        ${auditId},
        ${passportId},
        'create_identity',
        'agentpass',
        'api',
        'success',
        ${JSON.stringify({ name: body.name, email: agentEmail })}::jsonb
      )
    `;

    return c.json({
      passport_id: passportId,
      email: agentEmail,
      created_at: result[0].created_at.toISOString()
    }, 201);
  });

  // GET /passports/:id/public — public passport lookup (no auth required)
  router.get("/:id/public", async (c) => {
    const id = c.req.param("id");

    const rows = await db<PassportRow[]>`
      SELECT id, public_key, name, description, trust_score, status, created_at
      FROM passports WHERE id = ${id}
    `;
    const row = rows[0];

    if (!row) {
      return c.json(
        { error: "Passport not found", code: "NOT_FOUND" },
        404,
      );
    }

    if (row.status === "revoked") {
      return c.json({
        id: row.id,
        status: "revoked",
        trust_score: 0,
        trust_level: "revoked",
      });
    }

    return c.json({
      id: row.id,
      public_key: row.public_key,
      name: row.name,
      description: row.description,
      trust_score: row.trust_score,
      trust_level: getTrustLevel(row.trust_score),
      status: row.status,
      created_at: row.created_at.toISOString(),
    });
  });

  // GET /passports/:id — get full passport info (owner only)
  router.get("/:id", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const id = c.req.param("id");

    const rows = await db<PassportRow[]>`
      SELECT * FROM passports WHERE id = ${id}
    `;
    const row = rows[0];

    if (!row) {
      return c.json(
        { error: "Passport not found", code: "NOT_FOUND" },
        404,
      );
    }

    // Verify owner owns this passport
    if (row.owner_email !== owner.email) {
      return c.json(
        { error: "Access denied", code: "FORBIDDEN" },
        403,
      );
    }

    return c.json({
      id: row.id,
      public_key: row.public_key,
      owner_email: row.owner_email,
      name: row.name,
      description: row.description,
      trust_score: row.trust_score,
      trust_level: getTrustLevel(row.trust_score),
      status: row.status,
      metadata: row.metadata,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    });
  });

  // DELETE /passports/:id — revoke a passport (requires signature and owner auth)
  router.delete("/:id", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const id = c.req.param("id");
    const signature = c.req.header("X-AgentPass-Signature");

    // Require signature for revocation
    if (!signature) {
      return c.json(
        { error: "Signature required for revocation", code: "AUTH_REQUIRED" },
        401,
      );
    }

    // Look up passport to get public key and owner
    const rows = await db<Pick<PassportRow, "id" | "public_key" | "owner_email" | "status">[]>`
      SELECT id, public_key, owner_email, status FROM passports WHERE id = ${id}
    `;
    const row = rows[0];

    if (!row) {
      return c.json(
        { error: "Passport not found", code: "NOT_FOUND" },
        404,
      );
    }

    // Verify owner owns this passport
    if (row.owner_email !== owner.email) {
      return c.json(
        { error: "Access denied", code: "FORBIDDEN" },
        403,
      );
    }

    // Verify signature of passport ID using stored public key
    let valid: boolean;
    try {
      valid = verify(id, signature, row.public_key);
    } catch {
      valid = false;
    }

    if (!valid) {
      return c.json(
        { error: "Invalid signature", code: "AUTH_FAILED" },
        403,
      );
    }

    if (row.status === "revoked") {
      return c.json(
        { error: "Passport already revoked", code: "ALREADY_REVOKED" },
        409,
      );
    }

    await db`
      UPDATE passports SET status = 'revoked', updated_at = NOW() WHERE id = ${id}
    `;

    return c.json({ revoked: true });
  });

  return router;
}
