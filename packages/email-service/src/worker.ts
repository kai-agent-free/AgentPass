/**
 * Cloudflare Email Worker for AgentPass
 *
 * Handles all incoming emails to *@agent-mail.xyz via catch-all routing.
 * Stores emails in Durable Objects and notifies API server via webhook.
 */

import PostalMime from 'postal-mime';
import { DurableObject } from 'cloudflare:workers';

// Environment bindings
export interface Env {
  EMAIL_STORAGE: DurableObjectNamespace;
  API_SERVER_URL: string;
  WEBHOOK_SECRET: string;
}

// Email handler - entry point for incoming emails
export default {
  async email(message: EmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      const email = await parseIncomingEmail(message);

      // Store email in Durable Object
      const storageId = env.EMAIL_STORAGE.idFromName(email.to);
      const storage = env.EMAIL_STORAGE.get(storageId);
      await storage.storeEmail(email);

      // Notify API server via webhook (fire and forget)
      console.log(`Notifying API server: ${env.API_SERVER_URL}, secret: ${env.WEBHOOK_SECRET ? 'SET' : 'NOT SET'}`);
      ctx.waitUntil(
        notifyApiServer(email, env.API_SERVER_URL, env.WEBHOOK_SECRET)
      );

      console.log(`Email received and stored: ${email.id} to ${email.to}`);
    } catch (error) {
      console.error('Failed to process email:', error);
      throw error;
    }
  },

  // HTTP API for retrieving emails
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // POST /test-email - test endpoint for local development
    if (url.pathname === '/test-email' && request.method === 'POST') {
      const testEmail = await request.json() as TestEmailRequest;

      const email: StoredEmail = {
        id: crypto.randomUUID(),
        to: testEmail.to.toLowerCase(),
        from: testEmail.from.toLowerCase(),
        subject: testEmail.subject || '(no subject)',
        body: testEmail.body,
        html: testEmail.html,
        received_at: new Date().toISOString(),
      };

      const storageId = env.EMAIL_STORAGE.idFromName(email.to);
      const storage = env.EMAIL_STORAGE.get(storageId);
      await storage.storeEmail(email);

      return Response.json({ ok: true, email_id: email.id });
    }

    // GET /emails/:address - list emails for address
    if (url.pathname.match(/^\/emails\/[^/]+$/) && request.method === 'GET') {
      const address = url.pathname.split('/').pop()!.toLowerCase();

      const storageId = env.EMAIL_STORAGE.idFromName(address);
      const storage = env.EMAIL_STORAGE.get(storageId);
      const emails = await storage.listEmails();

      return Response.json(emails);
    }

    // GET /emails/:address/:id - get specific email
    if (url.pathname.match(/^\/emails\/[^/]+\/[^/]+$/) && request.method === 'GET') {
      const parts = url.pathname.split('/');
      const address = parts[2]!.toLowerCase();
      const emailId = parts[3]!;

      const storageId = env.EMAIL_STORAGE.idFromName(address);
      const storage = env.EMAIL_STORAGE.get(storageId);
      const email = await storage.getEmail(emailId);

      if (!email) {
        return Response.json({ error: 'Email not found' }, { status: 404 });
      }

      return Response.json(email);
    }

    // DELETE /emails/:address/:id - delete email
    if (url.pathname.match(/^\/emails\/[^/]+\/[^/]+$/) && request.method === 'DELETE') {
      const parts = url.pathname.split('/');
      const address = parts[2]!.toLowerCase();
      const emailId = parts[3]!;

      const storageId = env.EMAIL_STORAGE.idFromName(address);
      const storage = env.EMAIL_STORAGE.get(storageId);
      await storage.deleteEmail(emailId);

      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};

// Durable Object for email storage
export class EmailStorage extends DurableObject {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  async storeEmail(email: StoredEmail): Promise<void> {
    const key = `email:${email.id}`;
    await this.ctx.storage.put(key, email);

    // Also maintain a list of email IDs for this mailbox
    const listKey = 'email_ids';
    const ids = (await this.ctx.storage.get<string[]>(listKey)) || [];
    ids.push(email.id);
    await this.ctx.storage.put(listKey, ids);
  }

  async listEmails(): Promise<StoredEmail[]> {
    const listKey = 'email_ids';
    const ids = (await this.ctx.storage.get<string[]>(listKey)) || [];

    const emails: StoredEmail[] = [];
    for (const id of ids) {
      const email = await this.ctx.storage.get<StoredEmail>(`email:${id}`);
      if (email) {
        emails.push(email);
      }
    }

    // Sort by received_at descending (newest first)
    return emails.sort((a, b) =>
      new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
    );
  }

  async getEmail(emailId: string): Promise<StoredEmail | null> {
    const email = await this.ctx.storage.get<StoredEmail>(`email:${emailId}`);
    return email || null;
  }

  async deleteEmail(emailId: string): Promise<void> {
    await this.ctx.storage.delete(`email:${emailId}`);

    // Remove from list
    const listKey = 'email_ids';
    const ids = (await this.ctx.storage.get<string[]>(listKey)) || [];
    const filtered = ids.filter((id: string) => id !== emailId);
    await this.ctx.storage.put(listKey, filtered);
  }
}

// Types
interface StoredEmail {
  id: string;
  to: string;
  from: string;
  subject: string;
  body: string;
  html?: string;
  received_at: string;
  headers?: Record<string, string>;
}

interface TestEmailRequest {
  to: string;
  from: string;
  subject?: string;
  body: string;
  html?: string;
}

// Helpers
async function parseIncomingEmail(message: any): Promise<StoredEmail> {
  const parser = new PostalMime();
  const arrayBuffer = await new Response(message.raw).arrayBuffer();
  const email = await parser.parse(arrayBuffer);

  return {
    id: crypto.randomUUID(),
    to: message.to.toLowerCase(),
    from: message.from.toLowerCase(),
    subject: email.subject || '(no subject)',
    body: email.text || '',
    html: email.html,
    received_at: new Date().toISOString(),
    headers: email.headers ? Object.fromEntries(Object.entries(email.headers)) : {},
  };
}

function extractEmailContent(rawBody: string): { plain: string; html?: string } {
  // Simple MIME parsing - looks for plain text and HTML parts
  const parts = rawBody.split(/--[^\r\n]+/);

  let plain = '';
  let html: string | undefined;

  for (const part of parts) {
    if (part.includes('Content-Type: text/plain')) {
      const bodyStart = part.indexOf('\r\n\r\n');
      if (bodyStart !== -1) {
        plain = part.slice(bodyStart + 4).trim();
      }
    } else if (part.includes('Content-Type: text/html')) {
      const bodyStart = part.indexOf('\r\n\r\n');
      if (bodyStart !== -1) {
        html = part.slice(bodyStart + 4).trim();
      }
    }
  }

  // If no MIME parts found, treat entire body as plain text
  if (!plain && !html) {
    plain = rawBody;
  }

  return { plain, html };
}

async function notifyApiServer(
  email: StoredEmail,
  apiServerUrl: string,
  secret: string
): Promise<void> {
  try {
    console.log(`Sending webhook to: ${apiServerUrl}/webhook/email-received`);
    const response = await fetch(`${apiServerUrl}/webhook/email-received`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': secret,
      },
      body: JSON.stringify({
        email_id: email.id,
        to: email.to,
        from: email.from,
        subject: email.subject,
        received_at: email.received_at,
      }),
    });

    if (!response.ok) {
      console.error(`API server webhook failed: ${response.status} ${response.statusText}`);
    } else {
      console.log(`Webhook sent successfully for email ${email.id}`);
    }
  } catch (error) {
    console.error('Failed to notify API server:', error);
    // Don't throw - we don't want to fail email delivery if webhook fails
  }
}
