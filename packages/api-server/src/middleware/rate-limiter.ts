/**
 * Rate limiting middleware for Hono.
 *
 * Implements token bucket rate limiting with configurable limits per endpoint.
 * Tracks requests by IP address using an in-memory store with automatic cleanup.
 */

import type { Context, Next } from "hono";

interface RateLimitConfig {
  /** Maximum number of requests allowed in the time window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

interface BucketEntry {
  /** Number of tokens remaining */
  tokens: number;
  /** Timestamp of last refill */
  lastRefill: number;
}

/**
 * In-memory rate limit store.
 * Maps IP address -> endpoint path -> bucket entry.
 */
class RateLimitStore {
  private store = new Map<string, Map<string, BucketEntry>>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Try to consume a token for the given IP and endpoint.
   * Returns the number of tokens remaining, or -1 if rate limited.
   */
  consume(
    ip: string,
    endpoint: string,
    config: RateLimitConfig,
  ): { allowed: boolean; tokensRemaining: number; resetTime: number } {
    const now = Date.now();
    const ipStore = this.store.get(ip) ?? new Map<string, BucketEntry>();
    const bucket = ipStore.get(endpoint);

    if (!bucket) {
      // First request from this IP to this endpoint
      const newBucket: BucketEntry = {
        tokens: config.maxRequests - 1,
        lastRefill: now,
      };
      ipStore.set(endpoint, newBucket);
      this.store.set(ip, ipStore);
      return {
        allowed: true,
        tokensRemaining: newBucket.tokens,
        resetTime: now + config.windowMs,
      };
    }

    // Calculate how many tokens to refill based on elapsed time
    const elapsedMs = now - bucket.lastRefill;
    const tokensToAdd = Math.floor((elapsedMs / config.windowMs) * config.maxRequests);

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(config.maxRequests, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    if (bucket.tokens > 0) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        tokensRemaining: bucket.tokens,
        resetTime: bucket.lastRefill + config.windowMs,
      };
    }

    // Rate limited
    const resetTime = bucket.lastRefill + config.windowMs;
    return {
      allowed: false,
      tokensRemaining: 0,
      resetTime,
    };
  }

  /**
   * Remove stale entries older than 10 minutes.
   */
  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes

    for (const [ip, ipStore] of this.store.entries()) {
      for (const [endpoint, bucket] of ipStore.entries()) {
        if (now - bucket.lastRefill > staleThreshold) {
          ipStore.delete(endpoint);
        }
      }
      if (ipStore.size === 0) {
        this.store.delete(ip);
      }
    }
  }

  /**
   * Stop the cleanup interval.
   * Call this when shutting down the server.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

const store = new RateLimitStore();

/**
 * Extract client IP address from the request.
 * Only trusts X-Forwarded-For/X-Real-IP when TRUST_PROXY is enabled.
 * Falls back to a fingerprint based on request characteristics.
 */
function getClientIp(c: Context): string {
  const trustProxy = process.env.TRUST_PROXY === 'true';

  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) {
      // X-Forwarded-For may contain multiple IPs; take the first one
      return forwarded.split(",")[0]?.trim() ?? "anonymous";
    }
    const realIp = c.req.header("x-real-ip");
    if (realIp) return realIp;
  }

  // Fallback: use a combination of available headers as fingerprint
  // Never use "unknown" as it would allow attackers to share the same bucket
  const ua = c.req.header("user-agent") || "";
  const accept = c.req.header("accept") || "";
  return `anon-${Buffer.from(ua + accept).toString('base64url').slice(0, 16)}`;
}

/**
 * Create a rate limiting middleware with the specified configuration.
 *
 * @param config - Rate limit configuration (maxRequests per windowMs)
 * @returns Hono middleware that enforces the rate limit
 */
export function rateLimiter(config: RateLimitConfig) {
  return async (c: Context, next: Next) => {
    const ip = getClientIp(c);
    const endpoint = `${c.req.method} ${c.req.path}`;

    const result = store.consume(ip, endpoint, config);

    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil((result.resetTime - Date.now()) / 1000);
      return c.json(
        {
          error: "Rate limit exceeded",
          code: "RATE_LIMITED",
          retry_after: retryAfterSeconds,
        },
        429,
      );
    }

    await next();
  };
}

/**
 * Predefined rate limiters for common endpoints.
 */
export const rateLimiters = {
  /** Passport creation: 10 requests per minute */
  createPassport: rateLimiter({ maxRequests: 10, windowMs: 60 * 1000 }),

  /** Passport verification: 30 requests per minute */
  verifyPassport: rateLimiter({ maxRequests: 30, windowMs: 60 * 1000 }),

  /** Registration: 5 requests per minute */
  register: rateLimiter({ maxRequests: 5, windowMs: 60 * 1000 }),

  /** Login: 10 requests per minute */
  login: rateLimiter({ maxRequests: 10, windowMs: 60 * 1000 }),

  /** Default for other endpoints: 60 requests per minute */
  default: rateLimiter({ maxRequests: 60, windowMs: 60 * 1000 }),
};

/**
 * Clean up the rate limiter store.
 * Call this when shutting down the server.
 */
export function destroyRateLimiter(): void {
  store.destroy();
}
