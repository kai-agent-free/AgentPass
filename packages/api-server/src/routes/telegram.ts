/**
 * Telegram webhook and linking routes.
 *
 * Provides:
 * - POST /telegram/webhook — Telegram webhook endpoint (processes bot updates)
 * - GET  /telegram/link/:email — Generate deep link to bot with pre-filled email
 * - POST /telegram/link — Link a Telegram chat ID to an owner (authenticated)
 * - GET  /telegram/status — Check if Telegram notifications are enabled
 * - POST /telegram/notify — Send a notification to an owner's linked Telegram (authenticated)
 */

import { Hono } from "hono";
import type { Sql } from "../db/schema.js";
import { requireAuth, type OwnerPayload, type AuthVariables } from "../middleware/auth.js";

/**
 * Parse a Telegram bot update to extract /start deep link or /link command.
 * Returns { email, chatId } if a linking action is found, else null.
 */
export function parseLinkFromUpdate(
  update: Record<string, unknown>,
): { email: string; chatId: string } | null {
  const message = update.message as Record<string, unknown> | undefined;
  if (!message) return null;

  const chat = message.chat as Record<string, unknown> | undefined;
  const text = message.text as string | undefined;
  if (!chat || !text) return null;

  const chatId = String(chat.id);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // /start link_<email>
  const startMatch = text.match(/^\/start\s+link_(.+)$/);
  if (startMatch) {
    const email = decodeURIComponent(startMatch[1].trim());
    if (emailRegex.test(email)) return { email, chatId };
  }

  // /link <email>
  const linkMatch = text.match(/^\/link\s+(.+)$/);
  if (linkMatch) {
    const email = linkMatch[1].trim();
    if (emailRegex.test(email)) return { email, chatId };
  }

  return null;
}

/**
 * Store telegram_chat_id in owner_settings for the owner matching the given email.
 * Returns true if the owner was found and chat ID stored.
 */
export async function persistTelegramChatId(
  db: Sql,
  email: string,
  chatId: string,
): Promise<boolean> {
  // Find owner by email
  const owners = await db`SELECT id FROM owners WHERE email = ${email} LIMIT 1`;
  if (owners.length === 0) return false;

  const ownerId = owners[0].id as string;

  await db`
    INSERT INTO owner_settings (owner_id, key, value, updated_at)
    VALUES (${ownerId}, 'telegram_chat_id', ${chatId}, NOW())
    ON CONFLICT (owner_id, key)
    DO UPDATE SET value = ${chatId}, updated_at = NOW()
  `;

  return true;
}

/**
 * Get the stored Telegram chat ID for an owner.
 */
export async function getTelegramChatId(
  db: Sql,
  ownerId: string,
): Promise<string | null> {
  const rows = await db`
    SELECT value FROM owner_settings
    WHERE owner_id = ${ownerId} AND key = 'telegram_chat_id'
    LIMIT 1
  `;
  return rows.length > 0 ? (rows[0].value as string) : null;
}

/**
 * Get the stored Telegram chat ID by owner email.
 */
export async function getTelegramChatIdByEmail(
  db: Sql,
  email: string,
): Promise<string | null> {
  const rows = await db`
    SELECT os.value FROM owner_settings os
    JOIN owners o ON o.id = os.owner_id
    WHERE o.email = ${email} AND os.key = 'telegram_chat_id'
    LIMIT 1
  `;
  return rows.length > 0 ? (rows[0].value as string) : null;
}

export function createTelegramRouter(db?: Sql): Hono {
  const router = new Hono();

  /**
   * POST /webhook
   *
   * Telegram webhook endpoint. Processes updates from Telegram:
   * - /start link_<email> — links chat to owner
   * - /link <email> — links chat to owner
   *
   * When a grammY bot instance is attached (via setBot), it also
   * forwards updates to the bot for full command handling.
   */
  router.post("/webhook", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "Invalid JSON" }, 400);
    }

    // Try to extract and persist a link command
    if (db) {
      const linkInfo = parseLinkFromUpdate(body);
      if (linkInfo) {
        const stored = await persistTelegramChatId(db, linkInfo.email, linkInfo.chatId);
        if (!stored) {
          // Owner not found — still return ok to Telegram
          console.warn(`[Telegram Webhook] Owner not found for email: ${linkInfo.email}`);
        }
      }
    }

    // If a bot instance is attached, forward the update for full processing
    const bot = (router as unknown as { _bot?: { handleUpdate: (u: unknown) => Promise<void> } })._bot;
    if (bot) {
      try {
        await bot.handleUpdate(body);
      } catch (err) {
        console.error("[Telegram Webhook] Error processing update:", err);
      }
    }

    return c.json({ ok: true });
  });

  /**
   * POST /link
   *
   * Authenticated endpoint to link the current owner's account to a Telegram chat ID.
   * Body: { chat_id: string }
   */
  if (db) {
    const authedRouter = new Hono<{ Variables: AuthVariables }>();

    authedRouter.post("/link", requireAuth(db), async (c) => {
      const owner = c.get("owner") as OwnerPayload;
      const body = await c.req.json<{ chat_id?: string }>();

      if (!body.chat_id || typeof body.chat_id !== "string") {
        return c.json({ error: "Missing chat_id", code: "VALIDATION_ERROR" }, 400);
      }

      await db`
        INSERT INTO owner_settings (owner_id, key, value, updated_at)
        VALUES (${owner.owner_id}, 'telegram_chat_id', ${body.chat_id}, NOW())
        ON CONFLICT (owner_id, key)
        DO UPDATE SET value = ${body.chat_id}, updated_at = NOW()
      `;

      return c.json({ ok: true, chat_id: body.chat_id });
    });

    /**
     * DELETE /link
     *
     * Unlink Telegram from the authenticated owner's account.
     */
    authedRouter.delete("/link", requireAuth(db), async (c) => {
      const owner = c.get("owner") as OwnerPayload;

      await db`
        DELETE FROM owner_settings
        WHERE owner_id = ${owner.owner_id} AND key = 'telegram_chat_id'
      `;

      return c.json({ ok: true });
    });

    /**
     * GET /chat-id
     *
     * Get the linked Telegram chat ID for the authenticated owner.
     */
    authedRouter.get("/chat-id", requireAuth(db), async (c) => {
      const owner = c.get("owner") as OwnerPayload;

      const chatId = await getTelegramChatId(db, owner.owner_id);

      return c.json({ chat_id: chatId, linked: chatId !== null });
    });

    router.route("/", authedRouter);
  }

  /**
   * GET /link/:email
   *
   * Generate a deep link to the AgentPass Telegram bot with pre-filled email.
   */
  router.get("/link/:email", (c) => {
    const email = c.req.param("email");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return c.json(
        { error: "Invalid email format", code: "INVALID_EMAIL" },
        400,
      );
    }

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || "AgentPass_bot";
    const deepLink = `https://t.me/${botUsername}?start=link_${encodeURIComponent(email)}`;

    return c.json({
      email,
      link: deepLink,
      instructions:
        "Click the link to open Telegram and link your account to receive notifications from your AI agents.",
    });
  });

  /**
   * GET /status
   *
   * Check if Telegram notifications are enabled.
   */
  router.get("/status", (c) => {
    const enabled = !!process.env.TELEGRAM_BOT_TOKEN;
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || "AgentPass_bot";

    return c.json({
      enabled,
      bot_username: enabled ? botUsername : undefined,
      message: enabled
        ? "Telegram notifications are enabled"
        : "Telegram notifications are disabled (TELEGRAM_BOT_TOKEN not set)",
    });
  });

  return router;
}

/**
 * Attach a grammY bot instance to the router for webhook processing.
 */
export function attachBotToRouter(
  router: Hono,
  bot: { handleUpdate: (update: unknown) => Promise<void> },
): void {
  (router as unknown as { _bot?: unknown })._bot = bot;
}
