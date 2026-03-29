/**
 * Webhook routes for receiving events from external services.
 *
 * Includes email-received webhook from Cloudflare Email Worker and
 * SMS-received webhook from Twilio.
 */

import { Hono } from 'hono';
import type { Sql } from '../db/schema.js';
import { createHmac, timingSafeEqual } from 'crypto';
import { requireAuth, type OwnerPayload, type AuthVariables } from '../middleware/auth.js';

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
}

export function createWebhookRouter(db: Sql): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();

  /**
   * POST /webhook/email-received
   *
   * Called by Cloudflare Email Worker when a new email arrives.
   * Stores a notification record for real-time polling by MCP server.
   */
  app.post('/email-received', async (c) => {
    // Verify webhook secret (fail closed)
    const secret = c.req.header('X-Webhook-Secret');
    const expectedSecret = process.env.WEBHOOK_SECRET;

    if (!expectedSecret) {
      console.error('WEBHOOK_SECRET not configured - rejecting webhook');
      return c.json({ error: 'Server misconfiguration', code: 'CONFIG_ERROR' }, 500);
    }

    if (!secret || !constantTimeCompare(secret, expectedSecret)) {
      return c.json({ error: 'Invalid webhook secret', code: 'AUTH_FAILED' }, 401);
    }

    // Parse webhook payload
    const payload = await c.req.json<EmailWebhookPayload>();

    // Validate required fields
    if (!payload.email_id || !payload.to || !payload.from) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Store notification for MCP server to poll
    await db`
      INSERT INTO email_notifications (email_id, recipient, sender, subject, received_at)
      VALUES (${payload.email_id}, ${payload.to.toLowerCase()}, ${payload.from.toLowerCase()}, ${payload.subject || '(no subject)'}, ${payload.received_at})
    `;

    // TODO: In future, notify via WebSocket or SSE to MCP servers
    // For now, MCP server will poll GET /webhook/email-notifications/:address

    return c.json({ ok: true });
  });

  /**
   * GET /webhook/email-notifications/:address
   *
   * Poll for new email notifications for a specific address.
   * Returns list of pending notifications and marks them as retrieved.
   */
  app.get('/email-notifications/:address', requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const address = c.req.param('address').toLowerCase();

    // Scope access: only allow retrieving notifications for addresses owned by the authenticated user
    // Check if the address belongs to a passport owned by this user
    const ownerPassports = await db<{ id: string }[]>`
      SELECT id FROM passports
      WHERE owner_email = ${owner.email}
        AND (metadata->>'email_address' = ${address} OR owner_email = ${address})
    `;
    if (ownerPassports.length === 0) {
      return c.json({ error: "Access denied: address does not belong to your account", code: "FORBIDDEN" }, 403);
    }

    // Get all unprocessed notifications for this address
    interface EmailNotificationRow {
      email_id: string;
      recipient: string;
      sender: string;
      subject: string;
      received_at: Date;
      notified_at: Date;
    }

    const notifications = await db<EmailNotificationRow[]>`
      SELECT email_id, recipient, sender, subject, received_at, notified_at
      FROM email_notifications
      WHERE recipient = ${address} AND retrieved_at IS NULL
      ORDER BY received_at DESC
      LIMIT 50
    `;

    // Mark as retrieved
    if (notifications.length > 0) {
      const emailIds = notifications.map((n) => n.email_id);
      await db`
        UPDATE email_notifications
        SET retrieved_at = NOW()
        WHERE email_id = ANY(${emailIds})
      `;
    }

    return c.json({
      notifications: notifications.map(n => ({
        email_id: n.email_id,
        recipient: n.recipient,
        sender: n.sender,
        subject: n.subject,
        received_at: n.received_at.toISOString(),
        notified_at: n.notified_at.toISOString(),
      }))
    });
  });

  /**
   * POST /webhook/sms-received
   *
   * Called by Twilio when a new SMS arrives.
   * Validates Twilio signature and stores notification for MCP server polling.
   */
  app.post('/sms-received', async (c) => {
    // Verify webhook secret (fail closed)
    const webhookSecret = c.req.header('X-Webhook-Secret');
    const expectedWebhookSecret = process.env.WEBHOOK_SECRET;

    if (!expectedWebhookSecret) {
      console.error('WEBHOOK_SECRET not configured - rejecting webhook');
      return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 500, {
        'Content-Type': 'text/xml',
      });
    }

    if (!webhookSecret || !constantTimeCompare(webhookSecret, expectedWebhookSecret)) {
      return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 401, {
        'Content-Type': 'text/xml',
      });
    }

    // Parse Twilio form data ONCE to avoid stream consumption issues
    const formData = await c.req.parseBody();

    // Get Twilio auth token for signature validation
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (authToken) {
      // Validate Twilio signature
      const signature = c.req.header('X-Twilio-Signature');
      if (!signature || !validateTwilioSignature(c.req.url, formData, signature, authToken)) {
        console.warn('[SMS Webhook] Invalid Twilio signature');
        return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 400, {
          'Content-Type': 'text/xml',
        });
      }
    } else {
      console.warn('TWILIO_AUTH_TOKEN not configured - skipping Twilio signature validation (webhook secret validated)');
    }
    const messageSid = formData.MessageSid as string;
    const from = formData.From as string;
    const to = formData.To as string;
    const body = formData.Body as string;

    // Validate required fields
    if (!messageSid || !from || !to) {
      console.error('[SMS Webhook] Missing required fields');
      return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 400, {
        'Content-Type': 'text/xml',
      });
    }

    const receivedAt = new Date();

    // Store notification for MCP server to poll
    try {
      await db`
        INSERT INTO sms_notifications (sms_id, phone_number, sender, body, received_at)
        VALUES (${messageSid}, ${to}, ${from}, ${body || ''}, ${receivedAt})
      `;

      console.log('[SMS Webhook] Stored SMS notification');
    } catch (error) {
      console.error('[SMS Webhook] Failed to store notification:', error instanceof Error ? error.message : 'unknown error');
      return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 500, {
        'Content-Type': 'text/xml',
      });
    }

    // Return TwiML response (empty response = no reply)
    return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200, {
      'Content-Type': 'text/xml',
    });
  });

  /**
   * GET /webhook/sms-notifications/:phoneNumber
   *
   * Poll for new SMS notifications for a specific phone number.
   * Returns list of pending notifications and marks them as retrieved.
   */
  app.get('/sms-notifications/:phoneNumber', requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const phoneNumber = c.req.param('phoneNumber');

    // Scope access: only allow retrieving notifications for phone numbers owned by the authenticated user
    const ownerPassports = await db<{ id: string }[]>`
      SELECT id FROM passports
      WHERE owner_email = ${owner.email}
        AND metadata->>'phone_number' = ${phoneNumber}
    `;
    if (ownerPassports.length === 0) {
      return c.json({ error: "Access denied: phone number does not belong to your account", code: "FORBIDDEN" }, 403);
    }

    // Get all unprocessed notifications for this phone number
    interface SmsNotificationRow {
      sms_id: string;
      phone_number: string;
      sender: string;
      body: string;
      received_at: Date;
    }

    const rows = await db<SmsNotificationRow[]>`
      SELECT sms_id, phone_number, sender, body, received_at
      FROM sms_notifications
      WHERE phone_number = ${phoneNumber} AND retrieved_at IS NULL
      ORDER BY received_at DESC
      LIMIT 50
    `;

    // Mark as retrieved
    if (rows.length > 0) {
      const smsIds = rows.map((n) => n.sms_id);
      await db`
        UPDATE sms_notifications
        SET retrieved_at = NOW()
        WHERE sms_id = ANY(${smsIds})
      `;
    }

    const notifications = rows.map((row) => ({
      id: row.sms_id,
      to: row.phone_number,
      from: row.sender,
      body: row.body,
      received_at: row.received_at.toISOString(),
    }));

    return c.json({ notifications });
  });

  return app;
}

interface EmailWebhookPayload {
  email_id: string;
  to: string;
  from: string;
  subject?: string;
  received_at: string;
}

/**
 * Validate Twilio webhook signature.
 *
 * See: https://www.twilio.com/docs/usage/security#validating-requests
 */
function validateTwilioSignature(
  url: string,
  params: Record<string, string | File>,
  signature: string,
  authToken: string,
): boolean {
  // Build the data string: URL + sorted params
  const data = url + Object.keys(params).sort().map(key => {
    const value = params[key];
    return `${key}${typeof value === 'string' ? value : ''}`;
  }).join('');

  // Compute HMAC-SHA1
  const expectedSignature = createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');

  // Use constant-time comparison to prevent timing attacks
  return constantTimeCompare(expectedSignature, signature);
}
