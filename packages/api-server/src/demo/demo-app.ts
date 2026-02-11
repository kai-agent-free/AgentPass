/**
 * Demo service showcasing "Login with AgentPass" native authentication.
 *
 * A standalone Hono app (not mounted on the main API server) that
 * demonstrates how a third-party service integrates AgentPass native auth:
 *
 * 1. Publish a /.well-known/agentpass.json discovery endpoint.
 * 2. Accept challenge-response authentication using Ed25519.
 * 3. Issue session tokens and expose an agent profile endpoint.
 */

import { Hono } from "hono";
import crypto from "node:crypto";
import { verifyChallenge } from "@agentpass/core";

/** In-memory store for pending challenges keyed by challenge string. */
interface PendingChallenge {
  challenge: string;
  created_at: number;
}

/** Session stored after successful verification. */
interface AgentSession {
  passport_id: string;
  agent_name: string;
  authenticated_at: string;
}

/**
 * Create the demo Hono application.
 *
 * @param publicKeyLookup — optional callback to resolve a passport_id to its
 *   Ed25519 public key (base64url). When omitted the demo app uses a built-in
 *   in-memory registry that callers can populate via the returned `registerAgent` helper.
 */
export function createDemoApp(publicKeyLookup?: (passportId: string) => string | undefined) {
  const app = new Hono();

  // --- In-memory stores ---
  const pendingChallenges = new Map<string, PendingChallenge>();
  const sessions = new Map<string, AgentSession>();
  const knownAgents = new Map<string, { public_key: string; name: string }>();

  /** Resolve a public key for a passport ID. */
  const resolvePublicKey = (passportId: string): string | undefined => {
    if (publicKeyLookup) {
      return publicKeyLookup(passportId);
    }
    return knownAgents.get(passportId)?.public_key;
  };

  // --- Discovery endpoint ---

  app.get("/.well-known/agentpass.json", (c) => {
    return c.json({
      agentpass: true,
      auth_endpoint: "/api/auth/agent",
      capabilities: ["ed25519-verification"],
    });
  });

  // --- Landing page ---

  app.get("/", (c) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Demo Service — Login with AgentPass</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 4rem auto; text-align: center; }
    .btn { display: inline-block; padding: 0.75rem 1.5rem; background: #2563eb; color: #fff; border-radius: 0.5rem; text-decoration: none; font-size: 1.1rem; }
    .btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <h1>Demo Service</h1>
  <p>This service supports <strong>AgentPass</strong> native authentication.</p>
  <a class="btn" href="/.well-known/agentpass.json">Login with AgentPass</a>
</body>
</html>`;
    return c.html(html);
  });

  // --- Challenge endpoint ---

  app.post("/api/auth/agent/challenge", async (c) => {
    const challenge = crypto.randomBytes(32).toString("hex");

    pendingChallenges.set(challenge, {
      challenge,
      created_at: Date.now(),
    });

    // Expire challenges after 5 minutes
    setTimeout(() => {
      pendingChallenges.delete(challenge);
    }, 5 * 60 * 1000);

    return c.json({ challenge });
  });

  // --- Verify endpoint ---

  app.post("/api/auth/agent/verify", async (c) => {
    let body: { passport_id?: string; challenge?: string; signature?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { passport_id, challenge, signature } = body;

    if (!passport_id || !challenge || !signature) {
      return c.json({ error: "Missing required fields: passport_id, challenge, signature" }, 400);
    }

    // Check that the challenge is one we issued
    const pending = pendingChallenges.get(challenge);
    if (!pending) {
      return c.json({ error: "Unknown or expired challenge" }, 400);
    }

    // Resolve the public key
    const publicKey = resolvePublicKey(passport_id);
    if (!publicKey) {
      return c.json({ error: "Unknown passport ID" }, 404);
    }

    // Verify the Ed25519 signature
    let valid: boolean;
    try {
      valid = verifyChallenge(challenge, signature, publicKey);
    } catch {
      valid = false;
    }

    if (!valid) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    // Consume the challenge so it can't be reused
    pendingChallenges.delete(challenge);

    // Create a session token
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const agentName = knownAgents.get(passport_id)?.name ?? passport_id;

    sessions.set(sessionToken, {
      passport_id,
      agent_name: agentName,
      authenticated_at: new Date().toISOString(),
    });

    return c.json({
      session_token: sessionToken,
      agent_name: agentName,
    });
  });

  // --- Profile endpoint ---

  app.get("/api/auth/agent/profile", (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }

    const token = authHeader.slice(7);
    const session = sessions.get(token);

    if (!session) {
      return c.json({ error: "Invalid or expired session" }, 401);
    }

    return c.json({
      passport_id: session.passport_id,
      agent_name: session.agent_name,
      authenticated_at: session.authenticated_at,
    });
  });

  /**
   * Register an agent in the in-memory store for demo purposes.
   * Only used when no publicKeyLookup callback is provided.
   */
  const registerAgent = (passportId: string, publicKey: string, name?: string) => {
    knownAgents.set(passportId, { public_key: publicKey, name: name ?? passportId });
  };

  return { app, registerAgent };
}
