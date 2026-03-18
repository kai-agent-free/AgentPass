/**
 * Owner authentication routes.
 *
 * POST /auth/register — Create owner account
 * POST /auth/login    — Login and get JWT
 * GET  /auth/me       — Get current owner info (requires JWT)
 * POST /auth/logout   — Logout (stateless, just returns success)
 */

import crypto from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { Sql } from "../db/schema.js";
import bcrypt from "bcryptjs";
import { zValidator, getValidatedBody } from "../middleware/validation.js";
import { signJwt, requireAuth, type OwnerPayload, type AuthVariables } from "../middleware/auth.js";
import { rateLimiters } from "../middleware/rate-limiter.js";

// --- Zod schemas ---

const RegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be 128 characters or fewer"),
  name: z
    .string()
    .min(1, "Name is required")
    .max(64, "Name must be 64 characters or fewer"),
});

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type RegisterBody = z.infer<typeof RegisterSchema>;
type LoginBody = z.infer<typeof LoginSchema>;

// --- Row types ---

interface OwnerRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  verified: boolean;
  created_at: Date;
  updated_at: Date;
}

// --- Constants ---

const BCRYPT_SALT_ROUNDS = 12;

/**
 * Create the auth router bound to the given database instance.
 */
export function createAuthRouter(db: Sql): Hono<{ Variables: AuthVariables }> {
  const router = new Hono<{ Variables: AuthVariables }>();

  // POST /auth/register — Create owner account
  router.post("/register", rateLimiters.register, zValidator(RegisterSchema), async (c) => {
    const body = getValidatedBody<RegisterBody>(c);

    // Check if email already exists
    const existing = await db<Pick<OwnerRow, "id">[]>`
      SELECT id FROM owners WHERE email = ${body.email}
    `;

    if (existing.length > 0) {
      // Return generic message to prevent account enumeration
      return c.json(
        { message: "If this email is not already registered, an account will be created." },
        200,
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_SALT_ROUNDS);

    // Create owner
    const ownerId = crypto.randomUUID();

    await db`
      INSERT INTO owners (id, email, password_hash, name, verified)
      VALUES (${ownerId}, ${body.email}, ${passwordHash}, ${body.name}, false)
    `;

    // Auto-login: generate JWT token
    const token = await signJwt({
      owner_id: ownerId,
      email: body.email,
    });

    return c.json(
      {
        owner_id: ownerId,
        email: body.email,
        name: body.name,
        token,
      },
      201,
    );
  });

  // POST /auth/login — Login and get JWT
  router.post("/login", rateLimiters.login, zValidator(LoginSchema), async (c) => {
    const body = getValidatedBody<LoginBody>(c);

    // Look up owner by email
    const rows = await db<OwnerRow[]>`
      SELECT * FROM owners WHERE email = ${body.email}
    `;
    const row = rows[0];

    if (!row) {
      return c.json(
        { error: "Invalid email or password", code: "AUTH_FAILED" },
        401,
      );
    }

    // Verify password
    const valid = await bcrypt.compare(body.password, row.password_hash);

    if (!valid) {
      return c.json(
        { error: "Invalid email or password", code: "AUTH_FAILED" },
        401,
      );
    }

    // Generate JWT token
    const token = await signJwt({
      owner_id: row.id,
      email: row.email,
    });

    return c.json({
      owner_id: row.id,
      email: row.email,
      name: row.name,
      token,
    });
  });

  // GET /auth/me — Get current owner info (requires JWT)
  router.get("/me", requireAuth(), async (c) => {
    const owner = c.get("owner") as OwnerPayload;

    // Look up full owner info
    const rows = await db<OwnerRow[]>`
      SELECT * FROM owners WHERE id = ${owner.owner_id}
    `;
    const row = rows[0];

    if (!row) {
      return c.json(
        { error: "Owner not found", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json({
      owner_id: row.id,
      email: row.email,
      name: row.name,
      verified: row.verified,
      created_at: row.created_at.toISOString(),
    });
  });

  // POST /auth/logout — Logout (stateless, just returns success)
  router.post("/logout", (c) => {
    return c.json({ ok: true });
  });

  return router;
}
