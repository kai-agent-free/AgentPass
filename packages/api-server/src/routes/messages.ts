/**
 * Agent-to-agent messaging routes.
 *
 * POST   /messages     - Send a message to another agent's passport
 * GET    /messages      - List inbox for authenticated agent's passport
 * GET    /messages/:id  - Read a specific message (marks as read)
 * DELETE /messages/:id  - Delete a message
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Sql } from "../db/schema.js";
import { requireAuth, type OwnerPayload, type AuthVariables } from "../middleware/auth.js";

const SendMessageSchema = z.object({
  from_passport_id: z.string().min(1, "from_passport_id is required"),
  to_passport_id: z.string().min(1, "to_passport_id is required"),
  subject: z.string().max(256, "Subject must be 256 characters or fewer").optional().default(""),
  body: z.string().min(1, "Body is required").max(4096, "Body must be 4096 characters or fewer"),
});

interface MessageRow {
  id: string;
  from_passport_id: string;
  to_passport_id: string;
  subject: string;
  body: string;
  read: boolean;
  created_at: Date;
}

/**
 * Create the messages router bound to the given database instance.
 */
export function createMessagesRouter(db: Sql): Hono<{ Variables: AuthVariables }> {
  const router = new Hono<{ Variables: AuthVariables }>();

  // POST /messages — send a message
  router.post("/", requireAuth(db), async (c) => {
    const rawBody = await c.req.json();
    const parsed = SendMessageSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ error: parsed.error.errors[0].message, code: "VALIDATION_ERROR" }, 400);
    }

    const { from_passport_id, to_passport_id, subject, body } = parsed.data;
    const owner = c.get("owner") as OwnerPayload;

    // Verify sender owns the from_passport
    const fromRows = await db`
      SELECT id, owner_email FROM passports WHERE id = ${from_passport_id} AND status = 'active'
    `;
    if (fromRows.length === 0) {
      return c.json({ error: "Sender passport not found", code: "NOT_FOUND" }, 404);
    }
    if (fromRows[0].owner_email !== owner.email) {
      return c.json({ error: "You do not own this passport", code: "FORBIDDEN" }, 403);
    }

    // Verify recipient passport exists
    const toRows = await db`
      SELECT id FROM passports WHERE id = ${to_passport_id} AND status = 'active'
    `;
    if (toRows.length === 0) {
      return c.json({ error: "Recipient passport not found", code: "NOT_FOUND" }, 404);
    }

    const id = crypto.randomUUID();
    await db`
      INSERT INTO messages (id, from_passport_id, to_passport_id, subject, body)
      VALUES (${id}, ${from_passport_id}, ${to_passport_id}, ${subject}, ${body})
    `;

    return c.json({ id, from_passport_id, to_passport_id, subject, created_at: new Date().toISOString() }, 201);
  });

  // GET /messages — list inbox
  router.get("/", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const passport_id = c.req.query("passport_id");

    if (!passport_id) {
      return c.json({ error: "passport_id query parameter is required", code: "VALIDATION_ERROR" }, 400);
    }

    // Verify owner owns this passport
    const passportRows = await db`
      SELECT id, owner_email FROM passports WHERE id = ${passport_id} AND status = 'active'
    `;
    if (passportRows.length === 0 || passportRows[0].owner_email !== owner.email) {
      return c.json({ error: "Passport not found or not owned by you", code: "FORBIDDEN" }, 403);
    }

    const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(c.req.query("offset") || "0", 10) || 0, 0);

    const rows = await db<MessageRow[]>`
      SELECT id, from_passport_id, to_passport_id, subject, body, read, created_at
      FROM messages
      WHERE to_passport_id = ${passport_id}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return c.json({ messages: rows, limit, offset });
  });

  // GET /messages/:id — read a specific message
  router.get("/:id", requireAuth(db), async (c) => {
    const messageId = c.req.param("id");
    const owner = c.get("owner") as OwnerPayload;

    const rows = await db<MessageRow[]>`
      SELECT m.id, m.from_passport_id, m.to_passport_id, m.subject, m.body, m.read, m.created_at
      FROM messages m
      JOIN passports p ON (p.id = m.to_passport_id OR p.id = m.from_passport_id)
      WHERE m.id = ${messageId} AND p.owner_email = ${owner.email}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return c.json({ error: "Message not found", code: "NOT_FOUND" }, 404);
    }

    const message = rows[0];

    // Mark as read if recipient is viewing
    const recipientRows = await db`
      SELECT owner_email FROM passports WHERE id = ${message.to_passport_id}
    `;
    if (recipientRows.length > 0 && recipientRows[0].owner_email === owner.email && !message.read) {
      await db`UPDATE messages SET read = true WHERE id = ${messageId}`;
      message.read = true;
    }

    return c.json(message);
  });

  // DELETE /messages/:id — delete a message
  router.delete("/:id", requireAuth(db), async (c) => {
    const messageId = c.req.param("id");
    const owner = c.get("owner") as OwnerPayload;

    // Only recipient can delete
    const rows = await db<MessageRow[]>`
      SELECT m.id, m.to_passport_id
      FROM messages m
      JOIN passports p ON p.id = m.to_passport_id
      WHERE m.id = ${messageId} AND p.owner_email = ${owner.email}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return c.json({ error: "Message not found", code: "NOT_FOUND" }, 404);
    }

    await db`DELETE FROM messages WHERE id = ${messageId}`;
    return c.json({ deleted: true });
  });

  return router;
}
