/**
 * Browser session routes for live CAPTCHA viewing.
 *
 * MCP pushes screenshots and polls commands; Dashboard polls screenshots and sends commands.
 *
 * GET    /                       -- list sessions for an escalation (?escalation_id=...)
 * POST   /                       -- create a new browser session for an escalation
 * PUT    /:id/screenshot         -- update screenshot (MCP pushes)
 * GET    /:id                    -- get session with latest screenshot (Dashboard polls)
 * POST   /:id/command            -- send input command (Dashboard sends clicks/types)
 * GET    /:id/commands           -- get commands by status (MCP polls)
 * PATCH  /:id/commands/:cmdId    -- mark command as executed (MCP confirms)
 * POST   /:id/close              -- close the session
 */

import crypto from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { Sql } from "../db/schema.js";
import { zValidator, getValidatedBody } from "../middleware/validation.js";
import { requireAuth, type OwnerPayload, type AuthVariables } from "../middleware/auth.js";

// --- Zod schemas ---

const CreateSessionSchema = z.object({
  escalation_id: z.string().min(1, "Escalation ID is required"),
  page_url: z.string().optional(),
  viewport_w: z.number().int().positive().optional(),
  viewport_h: z.number().int().positive().optional(),
});

type CreateSessionBody = z.infer<typeof CreateSessionSchema>;

const UpdateScreenshotSchema = z.object({
  screenshot: z.string().min(1, "Screenshot data is required"),
  page_url: z.string().optional(),
});

type UpdateScreenshotBody = z.infer<typeof UpdateScreenshotSchema>;

const SendCommandSchema = z.object({
  type: z.enum(["click", "type", "scroll", "keypress"], {
    errorMap: () => ({ message: "Type must be one of: click, type, scroll, keypress" }),
  }),
  payload: z.record(z.unknown()),
});

type SendCommandBody = z.infer<typeof SendCommandSchema>;

const UpdateCommandStatusSchema = z.object({
  status: z.enum(["executed", "failed"], {
    errorMap: () => ({ message: "Status must be one of: executed, failed" }),
  }),
});

type UpdateCommandStatusBody = z.infer<typeof UpdateCommandStatusSchema>;

// --- Row types ---

interface BrowserSessionRow {
  id: string;
  escalation_id: string;
  screenshot: string | null;
  page_url: string;
  viewport_w: number;
  viewport_h: number;
  updated_at: Date;
  closed_at: Date | null;
}

interface BrowserCommandRow {
  id: string;
  session_id: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: Date;
}

function mapSessionRow(row: BrowserSessionRow) {
  return {
    id: row.id,
    escalation_id: row.escalation_id,
    screenshot: row.screenshot,
    page_url: row.page_url,
    viewport_w: row.viewport_w,
    viewport_h: row.viewport_h,
    updated_at: row.updated_at.toISOString(),
    closed_at: row.closed_at?.toISOString() ?? null,
  };
}

function mapCommandRow(row: BrowserCommandRow) {
  return {
    id: row.id,
    session_id: row.session_id,
    type: row.type,
    payload: row.payload,
    status: row.status,
    created_at: row.created_at.toISOString(),
  };
}

/**
 * Create the browser sessions router bound to the given database instance.
 */
export function createBrowserSessionsRouter(db: Sql): Hono<{ Variables: AuthVariables }> {
  const router = new Hono<{ Variables: AuthVariables }>();

  // --- Ownership helpers ---

  /**
   * Verify that the given escalation belongs to the authenticated owner.
   * Returns the escalation_id on success, or null if not found / forbidden.
   */
  async function verifyEscalationOwnership(
    escalationId: string,
    ownerEmail: string,
  ): Promise<{ valid: true } | { valid: false; status: 404 | 403; error: string; code: string }> {
    const rows = await db<{ owner_email: string }[]>`
      SELECT p.owner_email FROM escalations e
      JOIN passports p ON e.passport_id = p.id
      WHERE e.id = ${escalationId}
    `;

    if (rows.length === 0) {
      return { valid: false, status: 404, error: "Escalation not found", code: "NOT_FOUND" };
    }

    if (rows[0].owner_email !== ownerEmail) {
      return { valid: false, status: 403, error: "Access denied", code: "FORBIDDEN" };
    }

    return { valid: true };
  }

  /**
   * Verify that the given browser session belongs to the authenticated owner.
   * Joins browser_sessions -> escalations -> passports.
   */
  async function verifySessionOwnership(
    sessionId: string,
    ownerEmail: string,
  ): Promise<
    | { valid: true; session: BrowserSessionRow }
    | { valid: false; status: 404 | 403; error: string; code: string }
  > {
    const rows = await db<(BrowserSessionRow & { owner_email: string })[]>`
      SELECT bs.*, p.owner_email FROM browser_sessions bs
      JOIN escalations e ON bs.escalation_id = e.id
      JOIN passports p ON e.passport_id = p.id
      WHERE bs.id = ${sessionId}
    `;

    if (rows.length === 0) {
      return { valid: false, status: 404, error: "Browser session not found", code: "NOT_FOUND" };
    }

    if (rows[0].owner_email !== ownerEmail) {
      return { valid: false, status: 403, error: "Access denied", code: "FORBIDDEN" };
    }

    return { valid: true, session: rows[0] };
  }

  // GET / -- list browser sessions for an escalation
  router.get("/", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const escalationId = c.req.query("escalation_id");

    if (!escalationId) {
      return c.json(
        { error: "escalation_id query parameter is required", code: "VALIDATION_ERROR" },
        400,
      );
    }

    // Verify the escalation belongs to this owner
    const ownership = await verifyEscalationOwnership(escalationId, owner.email);
    if (!ownership.valid) {
      return c.json(
        { error: ownership.error, code: ownership.code },
        ownership.status,
      );
    }

    const rows = await db<BrowserSessionRow[]>`
      SELECT * FROM browser_sessions
      WHERE escalation_id = ${escalationId}
      ORDER BY updated_at DESC
    `;

    return c.json({
      sessions: rows.map(mapSessionRow),
    });
  });

  // POST / -- create a new browser session
  router.post("/", requireAuth(db), zValidator(CreateSessionSchema), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const body = getValidatedBody<CreateSessionBody>(c);

    const ownership = await verifyEscalationOwnership(body.escalation_id, owner.email);
    if (!ownership.valid) {
      return c.json(
        { error: ownership.error, code: ownership.code },
        ownership.status,
      );
    }

    const sessionId = crypto.randomUUID();

    const result = await db<{ updated_at: Date }[]>`
      INSERT INTO browser_sessions (id, escalation_id, page_url, viewport_w, viewport_h)
      VALUES (
        ${sessionId},
        ${body.escalation_id},
        ${body.page_url ?? ""},
        ${body.viewport_w ?? 1280},
        ${body.viewport_h ?? 720}
      )
      RETURNING updated_at
    `;

    return c.json(
      {
        session_id: sessionId,
        escalation_id: body.escalation_id,
        created_at: result[0].updated_at.toISOString(),
      },
      201,
    );
  });

  // PUT /:id/screenshot -- update screenshot (MCP pushes)
  router.put("/:id/screenshot", requireAuth(db), zValidator(UpdateScreenshotSchema), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const sessionId = c.req.param("id");
    const body = getValidatedBody<UpdateScreenshotBody>(c);

    const ownership = await verifySessionOwnership(sessionId, owner.email);
    if (!ownership.valid) {
      return c.json(
        { error: ownership.error, code: ownership.code },
        ownership.status,
      );
    }

    if (body.page_url !== undefined) {
      await db`
        UPDATE browser_sessions
        SET screenshot = ${body.screenshot},
            page_url = ${body.page_url},
            updated_at = NOW()
        WHERE id = ${sessionId}
      `;
    } else {
      await db`
        UPDATE browser_sessions
        SET screenshot = ${body.screenshot},
            updated_at = NOW()
        WHERE id = ${sessionId}
      `;
    }

    return c.json({ updated: true });
  });

  // GET /:id -- get session with latest screenshot (Dashboard polls)
  router.get("/:id", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const sessionId = c.req.param("id");

    const ownership = await verifySessionOwnership(sessionId, owner.email);
    if (!ownership.valid) {
      return c.json(
        { error: ownership.error, code: ownership.code },
        ownership.status,
      );
    }

    return c.json(mapSessionRow(ownership.session));
  });

  // POST /:id/command -- send input command (Dashboard sends clicks/types)
  router.post("/:id/command", requireAuth(db), zValidator(SendCommandSchema), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const sessionId = c.req.param("id");
    const body = getValidatedBody<SendCommandBody>(c);

    const ownership = await verifySessionOwnership(sessionId, owner.email);
    if (!ownership.valid) {
      return c.json(
        { error: ownership.error, code: ownership.code },
        ownership.status,
      );
    }

    if (ownership.session.closed_at !== null) {
      return c.json(
        { error: "Session is closed", code: "SESSION_CLOSED" },
        409,
      );
    }

    const commandId = crypto.randomUUID();

    await db`
      INSERT INTO browser_commands (id, session_id, type, payload)
      VALUES (${commandId}, ${sessionId}, ${body.type}, ${JSON.stringify(body.payload)})
    `;

    return c.json(
      {
        command_id: commandId,
        status: "pending",
      },
      201,
    );
  });

  // GET /:id/commands -- get commands by status (MCP polls)
  router.get("/:id/commands", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const sessionId = c.req.param("id");
    const statusFilter = c.req.query("status") ?? "pending";

    const ownership = await verifySessionOwnership(sessionId, owner.email);
    if (!ownership.valid) {
      return c.json(
        { error: ownership.error, code: ownership.code },
        ownership.status,
      );
    }

    const rows = await db<BrowserCommandRow[]>`
      SELECT * FROM browser_commands
      WHERE session_id = ${sessionId}
        AND status = ${statusFilter}
      ORDER BY created_at ASC
    `;

    return c.json({
      commands: rows.map(mapCommandRow),
    });
  });

  // PATCH /:id/commands/:cmdId -- mark command as executed (MCP confirms)
  router.patch("/:id/commands/:cmdId", requireAuth(db), zValidator(UpdateCommandStatusSchema), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const sessionId = c.req.param("id");
    const cmdId = c.req.param("cmdId");
    const body = getValidatedBody<UpdateCommandStatusBody>(c);

    const ownership = await verifySessionOwnership(sessionId, owner.email);
    if (!ownership.valid) {
      return c.json(
        { error: ownership.error, code: ownership.code },
        ownership.status,
      );
    }

    // Verify the command belongs to this session
    const commandRows = await db<{ id: string }[]>`
      SELECT id FROM browser_commands
      WHERE id = ${cmdId} AND session_id = ${sessionId}
    `;

    if (commandRows.length === 0) {
      return c.json(
        { error: "Command not found", code: "NOT_FOUND" },
        404,
      );
    }

    await db`
      UPDATE browser_commands
      SET status = ${body.status}
      WHERE id = ${cmdId}
    `;

    return c.json({ updated: true });
  });

  // POST /:id/close -- close the session
  router.post("/:id/close", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const sessionId = c.req.param("id");

    const ownership = await verifySessionOwnership(sessionId, owner.email);
    if (!ownership.valid) {
      return c.json(
        { error: ownership.error, code: ownership.code },
        ownership.status,
      );
    }

    if (ownership.session.closed_at !== null) {
      return c.json(
        { error: "Session already closed", code: "ALREADY_CLOSED" },
        409,
      );
    }

    const result = await db<{ closed_at: Date }[]>`
      UPDATE browser_sessions
      SET closed_at = NOW()
      WHERE id = ${sessionId}
      RETURNING closed_at
    `;

    return c.json({
      closed: true,
      closed_at: result[0].closed_at.toISOString(),
    });
  });

  return router;
}
