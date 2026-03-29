/**
 * Middleware to strip prototype pollution keys from request bodies.
 *
 * Recursively removes __proto__, constructor, and prototype keys
 * from parsed JSON bodies to prevent prototype pollution attacks.
 */

import type { Context, Next } from "hono";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Recursively strip dangerous keys from an object.
 */
function stripDangerousKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripDangerousKeys);

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    clean[key] = stripDangerousKeys(value);
  }
  return clean;
}

/**
 * Hono middleware that sanitizes request bodies against prototype pollution.
 */
export function sanitizeBody() {
  return async (c: Context, next: Next) => {
    if (c.req.header("content-type")?.includes("application/json")) {
      try {
        const body = await c.req.json();
        const sanitized = stripDangerousKeys(body);
        // Replace the req.json() method to return sanitized body
        c.req.json = async <T = unknown>(): Promise<T> => {
          return sanitized as T;
        };
      } catch {
        // If body isn't valid JSON, let downstream handlers deal with it
      }
    }
    await next();
  };
}
