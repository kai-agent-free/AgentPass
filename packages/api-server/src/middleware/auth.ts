/**
 * Authentication middleware for owner JWT tokens.
 *
 * Uses jose library for JWT signing and verification.
 */

import type { Context, Next } from "hono";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

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
 * Hono middleware that requires a valid JWT token in the Authorization header.
 *
 * On success, sets the owner payload in context via `c.set("owner", payload)`.
 * On failure, returns 401.
 *
 * Usage:
 *   router.get("/protected", requireAuth(), async (c) => {
 *     const owner = c.get("owner") as OwnerPayload;
 *     // ...
 *   });
 */
export function requireAuth() {
  return async (c: Context, next: Next) => {
    const header = c.req.header("Authorization");

    if (!header?.startsWith("Bearer ")) {
      return c.json(
        { error: "Authentication required", code: "AUTH_REQUIRED" },
        401,
      );
    }

    const token = header.slice(7);

    try {
      const payload = await verifyJwt(token);
      c.set("owner", payload);
      await next();
    } catch (err) {
      return c.json(
        { error: "Invalid or expired token", code: "AUTH_INVALID" },
        401,
      );
    }
  };
}
