/**
 * Authentication middleware for owner JWT tokens and API keys.
 *
 * Uses jose library for JWT signing and verification.
 * Supports API key authentication when a database instance is provided.
 */

import type { Context, Next } from "hono";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import bcrypt from "bcryptjs";
import { isApiKeyFormat, extractKeyPrefix } from "../utils/api-key.js";
import type { Sql } from "../db/schema.js";

/**
 * JWT payload for owner authentication.
 */
export interface OwnerPayload extends JWTPayload {
  owner_id: string;
  email: string;
}

/**
 * Hono context variables that can be set by middleware.
 */
export type AuthVariables = {
  owner: OwnerPayload;
};

/**
 * Get JWT secret from environment or use development default.
 * In production, JWT_SECRET env var is required.
 */
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "JWT_SECRET environment variable is required in production. " +
        "Generate a secure secret (min 32 chars) and set it in your environment.",
      );
    }
    // Development fallback
    console.warn("[Auth] Using default JWT_SECRET for development. DO NOT use in production.");
    return new TextEncoder().encode("dev-secret-DO-NOT-USE-IN-PRODUCTION-min-32-chars");
  }

  if (secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long");
  }

  return new TextEncoder().encode(secret);
}

const JWT_SECRET = getJwtSecret();
const JWT_ALGORITHM = "HS256";
const JWT_EXPIRATION = "7d"; // 7 days

/**
 * Sign a JWT token for the given owner payload.
 *
 * @param payload - Owner information to encode in the token
 * @returns Signed JWT token string
 */
export async function signJwt(payload: OwnerPayload): Promise<string> {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(JWT_SECRET);

  return token;
}

/**
 * Verify a JWT token and extract the owner payload.
 *
 * @param token - JWT token string
 * @returns Decoded owner payload
 * @throws If token is invalid or expired
 */
export async function verifyJwt(token: string): Promise<OwnerPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);

  // Validate that required fields are present
  if (!payload.owner_id || !payload.email) {
    throw new Error("Invalid token payload");
  }

  return payload as OwnerPayload;
}

/**
 * API key row returned from the database.
 */
interface ApiKeyRow {
  id: string;
  owner_id: string;
  key_hash: string;
  revoked_at: Date | null;
}

/**
 * Owner row for resolving email from owner_id.
 */
interface OwnerRow {
  id: string;
  email: string;
}

/**
 * Attempt to authenticate using an API key.
 *
 * Looks up the key by its prefix, verifies via bcrypt, checks revocation,
 * resolves the owner's email, and updates last_used timestamp.
 *
 * @returns OwnerPayload if valid, null otherwise
 */
export async function authenticateApiKey(
  db: Sql,
  token: string,
): Promise<OwnerPayload | null> {
  const prefix = extractKeyPrefix(token);

  // Look up all non-revoked keys matching this prefix
  const keyRows = await db<ApiKeyRow[]>`
    SELECT id, owner_id, key_hash, revoked_at
    FROM api_keys
    WHERE key_prefix = ${prefix} AND revoked_at IS NULL
  `;

  for (const row of keyRows) {
    const valid = await bcrypt.compare(token, row.key_hash);
    if (!valid) continue;

    // Resolve owner email
    const ownerRows = await db<OwnerRow[]>`
      SELECT id, email FROM owners WHERE id = ${row.owner_id}
    `;
    const owner = ownerRows[0];
    if (!owner) continue;

    // Update last_used timestamp (fire-and-forget)
    db`UPDATE api_keys SET last_used = NOW() WHERE id = ${row.id}`.catch(() => {});

    return {
      owner_id: owner.id,
      email: owner.email,
    };
  }

  return null;
}

/**
 * Hono middleware that requires authentication.
 *
 * When called without arguments (requireAuth()), only JWT tokens are accepted.
 * When called with a database instance (requireAuth(db)), API keys are also accepted.
 *
 * API key authentication checks the Bearer token for the `ak_live_` prefix before
 * trying JWT verification.
 *
 * On success, sets the owner payload in context via `c.set("owner", payload)`.
 * On failure, returns 401.
 *
 * Usage:
 *   // JWT-only (auth routes, api-keys management)
 *   router.get("/protected", requireAuth(), handler);
 *
 *   // JWT + API key (passports, audit, trust)
 *   router.get("/passports", requireAuth(db), handler);
 */
export function requireAuth(db?: Sql) {
  return async (c: Context, next: Next) => {
    const header = c.req.header("Authorization");

    if (!header?.startsWith("Bearer ")) {
      return c.json(
        { error: "Authentication required", code: "AUTH_REQUIRED" },
        401,
      );
    }

    const token = header.slice(7);

    // If db is provided and token looks like an API key, try API key auth first
    if (db && isApiKeyFormat(token)) {
      const payload = await authenticateApiKey(db, token);
      if (payload) {
        c.set("owner", payload);
        await next();
        return;
      }
      return c.json(
        { error: "Invalid or revoked API key", code: "AUTH_INVALID" },
        401,
      );
    }

    // Fall back to JWT verification
    try {
      const payload = await verifyJwt(token);
      c.set("owner", payload);
      await next();
    } catch {
      return c.json(
        { error: "Invalid or expired token", code: "AUTH_INVALID" },
        401,
      );
    }
  };
}
