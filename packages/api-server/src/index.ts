/**
 * AgentPass API Server entry point.
 *
 * Hono-based HTTP server providing passport management, verification,
 * and audit logging endpoints for AI agent identity.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type { Sql } from "./db/schema.js";
import { initDatabase } from "./db/schema.js";
import { createAuthRouter } from "./routes/auth.js";
import { createPassportsRouter } from "./routes/passports.js";
import { createVerifyRouter } from "./routes/verify.js";
import { createAuditRouter, createAuditListRouter } from "./routes/audit.js";
import { createTrustRouter } from "./routes/trust.js";
import { createApiKeysRouter } from "./routes/api-keys.js";
import { createApprovalsRouter } from "./routes/approvals.js";
import { createEscalationsRouter } from "./routes/escalations.js";
import { createBrowserSessionsRouter } from "./routes/browser-sessions.js";
import { createWebhookRouter } from "./routes/webhooks.js";
import { createTelegramRouter } from "./routes/telegram.js";
import { createMessagesRouter } from "./routes/messages.js";
import { createHealthRouter } from "./middleware/health.js";
import { rateLimiters } from "./middleware/rate-limiter.js";
import { requestLogger } from "./middleware/request-logging.js";
import { createDemoApp } from "./demo/demo-app.js";

const PORT = parseInt(process.env.AGENTPASS_PORT || "3846", 10);
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/agentpass";

/**
 * Create and configure the Hono application.
 *
 * Accepts an optional database connection string for tests.
 */
export async function createApp(connectionString: string = DATABASE_URL): Promise<{
  app: Hono;
  db: Sql;
  injectWebSocket: (server: ReturnType<typeof serve>) => void;
}> {
  const db = await initDatabase(connectionString);
  const app = new Hono();

  // WebSocket support for real-time browser session streaming
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  // --- Global middleware ---
  // Request logging (must be first to capture all requests)
  app.use("*", requestLogger());

  // CORS with restricted origins
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim())
    || ['http://localhost:3847', 'http://localhost:3848', 'http://localhost:3849', 'http://localhost:5173'];

  app.use("*", cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Secret', 'X-AgentPass-ID', 'X-AgentPass-Signature', 'X-Request-ID'],
  }));

  // Apply default rate limiting to all routes
  app.use("*", rateLimiters.default);

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
        telegram: "/telegram/link/:email",
      },
      capabilities: ["ed25519-verification", "trust-scoring", "audit-logging"],
    });
  });

  // --- Route groups ---
  const authRouter = createAuthRouter(db);
  const passportsRouter = createPassportsRouter(db);
  const verifyRouter = createVerifyRouter(db);
  const auditRouter = createAuditRouter(db);
  const auditListRouter = createAuditListRouter(db);
  const trustRouter = createTrustRouter(db);
  const apiKeysRouter = createApiKeysRouter(db);
  const approvalsRouter = createApprovalsRouter(db);
  const escalationsRouter = createEscalationsRouter(db);
  const browserSessionsRouter = createBrowserSessionsRouter(db, upgradeWebSocket);
  const webhookRouter = createWebhookRouter(db);
  const messagesRouter = createMessagesRouter(db);
  const telegramRouter = createTelegramRouter();
  const healthRouter = createHealthRouter(db);

  app.route("/", healthRouter);
  app.route("/auth", authRouter);
  app.route("/passports", passportsRouter);
  app.route("/verify", verifyRouter);
  // Audit routes: per-passport under /passports, global list under /audit
  app.route("/passports", auditRouter);
  app.route("/audit", auditListRouter);
  // Trust routes are nested under /passports/:id/trust and /passports/:id/report-abuse
  app.route("/passports", trustRouter);
  // API key management (JWT-only auth)
  app.route("/api-keys", apiKeysRouter);
  // Approval request management
  app.route("/approvals", approvalsRouter);
  // CAPTCHA escalation management
  app.route("/escalations", escalationsRouter);
  // Browser session management (live CAPTCHA viewing)
  app.route("/browser-sessions", browserSessionsRouter);
  // Webhook routes for external services (email worker, etc.)
  app.route("/webhook", webhookRouter);
  // Agent-to-agent messaging
  app.route("/messages", messagesRouter);
  // Telegram routes for bot webhooks and account linking
  app.route("/telegram", telegramRouter);

  // Demo service — "Login with AgentPass" native auth showcase
  const { app: demoApp } = createDemoApp(
    async (passportId: string) => {
      const rows = await db`SELECT public_key FROM passports WHERE id = ${passportId} AND status = 'active' LIMIT 1`;
      return rows[0]?.public_key as string | undefined;
    },
    async (entry) => {
      try {
        const auditId = crypto.randomUUID();
        await db`
          INSERT INTO audit_log (id, passport_id, action, service, method, result, details)
          VALUES (
            ${auditId},
            ${entry.passport_id},
            ${entry.action},
            ${entry.service},
            ${entry.method},
            ${entry.result},
            ${JSON.stringify(entry.details ?? {})}::jsonb
          )
        `;
      } catch (err) {
        console.error("[Demo audit log]", err);
      }
    },
  );
  app.route("/demo", demoApp);

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

  return { app, db, injectWebSocket };
}

// --- Start server when run directly ---
const isMainModule = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");

if (isMainModule) {
  createApp().then(({ app, injectWebSocket }) => {
    const server = serve(
      { fetch: app.fetch, port: PORT },
      (info) => {
        console.log(`AgentPass API Server running on http://localhost:${info.port}`);
        console.log(`Discovery: http://localhost:${info.port}/.well-known/agentpass.json`);
      },
    );

    injectWebSocket(server);
  });
}
