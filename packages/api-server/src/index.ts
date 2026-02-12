/**
 * AgentPass API Server entry point.
 *
 * Hono-based HTTP server providing passport management, verification,
 * and audit logging endpoints for AI agent identity.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import type { Client } from "@libsql/client";
import { initDatabase } from "./db/schema.js";
import { createPassportsRouter } from "./routes/passports.js";
import { createVerifyRouter } from "./routes/verify.js";
import { createAuditRouter } from "./routes/audit.js";
import { createTrustRouter } from "./routes/trust.js";
import { createWebhookRouter } from "./routes/webhooks.js";
import { createHealthRouter } from "./middleware/health.js";

const PORT = parseInt(process.env.AGENTPASS_PORT || "3846", 10);
const DB_PATH = process.env.AGENTPASS_DB_PATH || "agentpass.db";

/**
 * Create and configure the Hono application.
 *
 * Accepts an optional database path so tests can pass ":memory:".
 */
export async function createApp(dbPath: string = DB_PATH): Promise<{ app: Hono; db: Client }> {
  const db = await initDatabase(dbPath);
  const app = new Hono();

  // --- Global middleware ---
  app.use("*", cors());

  // --- Well-known discovery endpoint ---
  app.get("/.well-known/agentpass.json", (c) => {
    return c.json({
      name: "AgentPass",
      version: "0.1.0",
      description: "Identity layer for autonomous AI agents",
      endpoints: {
        passports: "/passports",
        verify: "/verify",
        audit: "/passports/:id/audit",
        webhook: "/webhook/email-received",
      },
      capabilities: ["ed25519-verification", "trust-scoring", "audit-logging"],
    });
  });

  // --- Route groups ---
  const passportsRouter = createPassportsRouter(db);
  const verifyRouter = createVerifyRouter(db);
  const auditRouter = createAuditRouter(db);
  const trustRouter = createTrustRouter(db);
  const webhookRouter = createWebhookRouter(db);
  const healthRouter = createHealthRouter(db);

  app.route("/", healthRouter);
  app.route("/passports", passportsRouter);
  app.route("/verify", verifyRouter);
  // Audit routes are nested under /passports/:id/audit
  // Mount them at root since they already include /passports/:id/audit paths
  app.route("/", auditRouter);
  // Trust routes are nested under /passports/:id/trust and /passports/:id/report-abuse
  app.route("/passports", trustRouter);
  // Webhook routes for external services (email worker, etc.)
  app.route("/webhook", webhookRouter);

  // --- Global error handler ---
  app.onError((err, c) => {
    console.error("[AgentPass API]", err);
    return c.json(
      {
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      },
      500,
    );
  });

  // --- 404 handler ---
  app.notFound((c) => {
    return c.json(
      { error: "Not found", code: "NOT_FOUND" },
      404,
    );
  });

  return { app, db };
}

// --- Start server when run directly ---
const isMainModule = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");

if (isMainModule) {
  createApp().then(({ app }) => {
    serve(
      { fetch: app.fetch, port: PORT },
      (info) => {
        console.log(`AgentPass API Server running on http://localhost:${info.port}`);
        console.log(`Discovery: http://localhost:${info.port}/.well-known/agentpass.json`);
      },
    );
  });
}
