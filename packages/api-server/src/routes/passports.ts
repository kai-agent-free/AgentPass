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
import type { Client } from "@libsql/client";
import { zValidator, getValidatedBody } from "../middleware/validation.js";
import { rateLimiters } from "../middleware/rate-limiter.js";
import { requireAuth, type OwnerPayload, type AuthVariables } from "../middleware/auth.js";

// --- Zod schemas for request validation ---

const RegisterPassportSchema = z.object({
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
});

type RegisterPassportBody = z.infer<typeof RegisterPassportSchema>;

// --- Row type returned from SQLite ---

interface PassportRow {
  id: string;
  public_key: string;
  owner_email: string;
  name: string;
  description: string;
  trust_score: number;
  status: string;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Create the passports router bound to the given database instance.
 */
export function createPassportsRouter(db: Client): Hono<{ Variables: AuthVariables }> {
  const router = new Hono<{ Variables: AuthVariables }>();

  // GET /passports — list all passports (filtered by owner)
  router.get("/", requireAuth(), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(c.req.query("offset") || "0", 10) || 0, 0);

    const rowsResult = await db.execute({
      sql: "SELECT * FROM passports WHERE owner_email = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      args: [owner.email, limit, offset],
    });
    const rows = rowsResult.rows as unknown as PassportRow[];

    const totalResult = await db.execute({
      sql: "SELECT COUNT(*) as count FROM passports WHERE owner_email = ?",
      args: [owner.email],
    });
    const totalRow = totalResult.rows[0] as unknown as { count: number };

    const passports = rows.map((row) => ({
      id: row.id,
      public_key: row.public_key,
      owner_email: row.owner_email,
      name: row.name,
      description: row.description,
      trust_score: row.trust_score,
      status: row.status,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return c.json({
      passports,
      total: totalRow.count,
      limit,
      offset,
    });
  });

  // POST /passports — register a new passport
  router.post("/", requireAuth(), rateLimiters.createPassport, zValidator(RegisterPassportSchema), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const body = getValidatedBody<RegisterPassportBody>(c);
    const passportId = generatePassportId();
    const now = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO passports (id, public_key, owner_email, name, description, trust_score, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, 'active', ?, ?)`,
      args: [passportId, body.public_key, owner.email, body.name, body.description, now, now],
    });

    return c.json({ passport_id: passportId, created_at: now }, 201);
  });

  // GET /passports/:id — get passport info
  router.get("/:id", requireAuth(), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const id = c.req.param("id");
    const result = await db.execute({
      sql: "SELECT * FROM passports WHERE id = ?",
      args: [id],
    });
    const row = result.rows[0] as unknown as PassportRow | undefined;

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
      status: row.status,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  });

  // DELETE /passports/:id — revoke a passport (requires signature and owner auth)
  router.delete("/:id", requireAuth(), async (c) => {
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
    const result = await db.execute({
      sql: "SELECT id, public_key, owner_email, status FROM passports WHERE id = ?",
      args: [id],
    });
    const row = result.rows[0] as unknown as Pick<PassportRow, "id" | "public_key" | "owner_email" | "status"> | undefined;

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

    const now = new Date().toISOString();
    await db.execute({
      sql: "UPDATE passports SET status = 'revoked', updated_at = ? WHERE id = ?",
      args: [now, id],
    });

    return c.json({ revoked: true });
  });

  return router;
}
