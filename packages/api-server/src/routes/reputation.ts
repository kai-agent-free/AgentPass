/**
 * DID Reputation routes — powered by CoinPay Reputation Protocol.
 *
 * GET  /reputation/:did          — Get reputation for a DID
 * GET  /reputation/:did/trust    — Get trust vector {E,P,B,D,R,A,C}
 * GET  /reputation/:did/badge    — Proxy badge SVG from CoinPay
 * POST /reputation/receipt       — Submit a task receipt (requires auth)
 * GET  /reputation/did/me        — Get this platform's DID (requires auth)
 * POST /reputation/did/claim     — Claim a DID (requires auth)
 * POST /reputation/issuer        — Register as platform issuer (requires auth)
 */

import { Hono } from "hono";
import type { Sql } from "../db/schema.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

// Lazy-load SDK to avoid subpath export issues
let _coinpay: any = null;
let _reputation: any = null;

async function loadSDK() {
  if (!_coinpay) {
    _coinpay = await import("@profullstack/coinpay");
  }
  if (!_reputation) {
    // The reputation subpath isn't in the exports map, so resolve manually
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const path = req.resolve("@profullstack/coinpay/src/reputation.js");
    _reputation = await import(path);
  }
  return { coinpay: _coinpay, reputation: _reputation };
}

function getCoinPayClient() {
  const apiKey = process.env.COINPAY_API_KEY;
  if (!apiKey) {
    throw new Error("COINPAY_API_KEY environment variable is not set");
  }
  const { CoinPayClient } = _coinpay;
  return new CoinPayClient({
    apiKey,
    baseUrl: process.env.COINPAY_BASE_URL || "https://coinpayportal.com/api",
  });
}

export function createReputationRouter(db: Sql) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const auth = requireAuth(db);

  // Ensure SDK is loaded before handling requests
  app.use("*", async (_c, next) => {
    await loadSDK();
    return next();
  });

  // --- Public endpoints ---

  app.get("/:did", async (c) => {
    const did = decodeURIComponent(c.req.param("did"));
    try {
      const client = getCoinPayClient();
      const result = await _reputation.getReputation(client, did);
      return c.json(result);
    } catch (err: any) {
      if (err.message?.includes("COINPAY_API_KEY")) {
        return c.json({ error: "Reputation service not configured" }, 503);
      }
      return c.json({ error: "Failed to fetch reputation", detail: err.message }, 502);
    }
  });

  app.get("/:did/trust", async (c) => {
    const did = decodeURIComponent(c.req.param("did"));
    try {
      const client = getCoinPayClient();
      const result = await _reputation.getTrustProfile(client, did);
      return c.json(result);
    } catch (err: any) {
      if (err.message?.includes("COINPAY_API_KEY")) {
        return c.json({ error: "Reputation service not configured" }, 503);
      }
      return c.json({ error: "Failed to fetch trust profile", detail: err.message }, 502);
    }
  });

  app.get("/:did/badge", async (c) => {
    const did = decodeURIComponent(c.req.param("did"));
    const baseUrl = process.env.COINPAY_BASE_URL || "https://coinpayportal.com/api";
    const badgeUrl = _reputation.getBadgeUrl(baseUrl, did);

    try {
      const res = await fetch(badgeUrl, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return c.json({ error: "Badge not available" }, res.status as any);
      }
      const svg = await res.text();
      c.header("Content-Type", "image/svg+xml");
      c.header("Cache-Control", "public, max-age=300");
      return c.body(svg);
    } catch {
      return c.json({ error: "Badge fetch failed" }, 502);
    }
  });

  // --- Authenticated endpoints ---

  app.post("/receipt", auth, async (c) => {
    try {
      const client = getCoinPayClient();
      const receipt = await c.req.json();
      const result = await _reputation.submitReceipt(client, receipt);
      return c.json(result);
    } catch (err: any) {
      if (err.message?.includes("COINPAY_API_KEY")) {
        return c.json({ error: "Reputation service not configured" }, 503);
      }
      return c.json({ error: "Failed to submit receipt", detail: err.message }, 502);
    }
  });

  app.get("/did/me", auth, async (c) => {
    try {
      const client = getCoinPayClient();
      const result = await _reputation.getMyDid(client);
      return c.json(result);
    } catch (err: any) {
      if (err.message?.includes("COINPAY_API_KEY")) {
        return c.json({ error: "Reputation service not configured" }, 503);
      }
      return c.json({ error: "Failed to get DID", detail: err.message }, 502);
    }
  });

  app.post("/did/claim", auth, async (c) => {
    try {
      const client = getCoinPayClient();
      const result = await _reputation.claimDid(client);
      return c.json(result);
    } catch (err: any) {
      if (err.message?.includes("COINPAY_API_KEY")) {
        return c.json({ error: "Reputation service not configured" }, 503);
      }
      return c.json({ error: "Failed to claim DID", detail: err.message }, 502);
    }
  });

  app.post("/issuer", auth, async (c) => {
    try {
      const client = getCoinPayClient();
      const body = await c.req.json();
      const result = await _reputation.registerPlatformIssuer(client, {
        name: body.name || "AgentPass",
        domain: body.domain || "agentpass.space",
      });
      return c.json(result);
    } catch (err: any) {
      if (err.message?.includes("COINPAY_API_KEY")) {
        return c.json({ error: "Reputation service not configured" }, 503);
      }
      return c.json({ error: "Failed to register issuer", detail: err.message }, 502);
    }
  });

  return app;
}
