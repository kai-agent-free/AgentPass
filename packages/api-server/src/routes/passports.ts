/**
 * Passport management routes.
 *
 * POST   /passports     - Register a new passport
 * GET    /passports/:id - Get passport info (public data only)
 * DELETE /passports/:id - Revoke a passport
 */

import { Hono } from "hono";
import { z } from "zod";
import { generatePassportId } from "@agentpass/core";
import type { Client } from "@libsql/client";
import { zValidator, getValidatedBody } from "../middleware/validation.js";

// --- Zod schemas for request validation ---

const RegisterPassportSchema = z.object({
  public_key: z.string().min(1, "Public key is required"),
  owner_email: z.string().email("Invalid email address"),
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
export function createPassportsRouter(db: Client): Hono {
  const router = new Hono();

  // POST /passports — register a new passport
  router.post("/", zValidator(RegisterPassportSchema), async (c) => {
    const body = getValidatedBody<RegisterPassportBody>(c);
    const passportId = generatePassportId();
    const now = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO passports (id, public_key, owner_email, name, description, trust_score, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, 'active', ?, ?)`,
      args: [passportId, body.public_key, body.owner_email, body.name, body.description, now, now],
    });

    return c.json({ passport_id: passportId, created_at: now }, 201);
  });

  // GET /passports/:id — get passport info
  router.get("/:id", async (c) => {
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

  // DELETE /passports/:id — revoke a passport
  router.delete("/:id", async (c) => {
    const id = c.req.param("id");

    const result = await db.execute({
      sql: "SELECT id, status FROM passports WHERE id = ?",
      args: [id],
    });
    const row = result.rows[0] as unknown as Pick<PassportRow, "id" | "status"> | undefined;

    if (!row) {
      return c.json(
        { error: "Passport not found", code: "NOT_FOUND" },
        404,
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
