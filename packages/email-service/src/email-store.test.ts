import { describe, it, expect, beforeEach } from 'vitest';
import { EmailStore } from './email-store.js';
import type { IncomingEmail } from './types.js';

function makeEmail(overrides: Partial<IncomingEmail> = {}): IncomingEmail {
  return {
    id: crypto.randomUUID(),
    to: 'bot@agentpass.dev',
    from: 'noreply@example.com',
    subject: 'Welcome',
    body: 'Hello agent',
    received_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('EmailStore', () => {
  let store: EmailStore;

  beforeEach(() => {
    store = new EmailStore();
  });

  // ----------------------------------------------------------------
  // addEmail / getEmails
  // ----------------------------------------------------------------

  describe('addEmail & getEmails', () => {
    it('stores and retrieves an email', () => {
      const email = makeEmail();
      store.addEmail(email);

      const result = store.getEmails('bot@agentpass.dev');
      expect(result).toHaveLength(1);
      expect(result[0]!.subject).toBe('Welcome');
    });

    it('lowercases addresses on storage', () => {
      store.addEmail(makeEmail({ to: 'Bot@AgentPass.Dev' }));
      const result = store.getEmails('bot@agentpass.dev');
      expect(result).toHaveLength(1);
    });

    it('returns empty array for unknown address', () => {
      expect(store.getEmails('unknown@agentpass.dev')).toEqual([]);
    });

    it('filters by from', () => {
      store.addEmail(makeEmail({ from: 'a@example.com' }));
      store.addEmail(makeEmail({ from: 'b@example.com' }));

      const result = store.getEmails('bot@agentpass.dev', { from: 'a@example' });
      expect(result).toHaveLength(1);
      expect(result[0]!.from).toBe('a@example.com');
    });

    it('filters by subject', () => {
      store.addEmail(makeEmail({ subject: 'Verify your account' }));
      store.addEmail(makeEmail({ subject: 'Weekly digest' }));

      const result = store.getEmails('bot@agentpass.dev', { subject: 'verify' });
      expect(result).toHaveLength(1);
    });

    it('filters by after', () => {
      const old = makeEmail({ received_at: '2024-01-01T00:00:00Z' });
      const recent = makeEmail({ received_at: '2025-06-01T00:00:00Z' });
      store.addEmail(old);
      store.addEmail(recent);

      const result = store.getEmails('bot@agentpass.dev', { after: '2025-01-01T00:00:00Z' });
      expect(result).toHaveLength(1);
      expect(result[0]!.received_at).toBe('2025-06-01T00:00:00Z');
    });
  });

  // ----------------------------------------------------------------
  // getEmail
  // ----------------------------------------------------------------

  describe('getEmail', () => {
    it('retrieves email by ID', () => {
      const email = makeEmail({ id: 'test-id-123' });
      store.addEmail(email);

      const result = store.getEmail('test-id-123');
      expect(result).toBeDefined();
      expect(result!.id).toBe('test-id-123');
    });

    it('returns undefined for unknown ID', () => {
      expect(store.getEmail('nonexistent')).toBeUndefined();
    });
  });

  // ----------------------------------------------------------------
  // waitForEmail
  // ----------------------------------------------------------------

  describe('waitForEmail', () => {
    it('resolves immediately if email already exists', async () => {
      store.addEmail(makeEmail({ subject: 'Confirmation' }));

      const email = await store.waitForEmail('bot@agentpass.dev', { subject: 'confirmation' });
      expect(email.subject).toBe('Confirmation');
    });

    it('resolves when email arrives after a delay', async () => {
      setTimeout(() => {
        store.addEmail(makeEmail({ subject: 'Delayed confirmation' }));
      }, 300);

      const email = await store.waitForEmail(
        'bot@agentpass.dev',
        { subject: 'delayed' },
        5_000,
      );
      expect(email.subject).toBe('Delayed confirmation');
    });

    it('rejects on timeout', async () => {
      await expect(
        store.waitForEmail('bot@agentpass.dev', { subject: 'never-arrives' }, 400),
      ).rejects.toThrow('Timed out waiting for email to bot@agentpass.dev');
    });
  });

  // ----------------------------------------------------------------
  // extractVerificationLink
  // ----------------------------------------------------------------

  describe('extractVerificationLink', () => {
    it('extracts href from HTML email', () => {
      const email = makeEmail({
        html: '<a href="https://example.com/verify?token=abc123">Verify</a>',
        body: 'Click the link to verify.',
      });
      store.addEmail(email);

      expect(store.extractVerificationLink(email.id)).toBe(
        'https://example.com/verify?token=abc123',
      );
    });

    it('extracts verification URL from plain text', () => {
      const email = makeEmail({
        body: 'Please confirm your email: https://app.io/confirm?t=xyz',
      });
      store.addEmail(email);

      expect(store.extractVerificationLink(email.id)).toBe('https://app.io/confirm?t=xyz');
    });

    it('extracts URL with "activate" keyword', () => {
      const email = makeEmail({
        body: 'Activate here: https://service.com/activate/12345',
      });
      store.addEmail(email);

      expect(store.extractVerificationLink(email.id)).toBe(
        'https://service.com/activate/12345',
      );
    });

    it('falls back to any URL if no verification keyword found', () => {
      const email = makeEmail({
        body: 'Visit https://example.com/welcome to get started.',
      });
      store.addEmail(email);

      expect(store.extractVerificationLink(email.id)).toBe('https://example.com/welcome');
    });

    it('decodes HTML entities in href', () => {
      const email = makeEmail({
        html: '<a href="https://example.com/verify?a=1&amp;b=2">Verify</a>',
        body: '',
      });
      store.addEmail(email);

      expect(store.extractVerificationLink(email.id)).toBe(
        'https://example.com/verify?a=1&b=2',
      );
    });

    it('returns undefined for unknown email ID', () => {
      expect(store.extractVerificationLink('nope')).toBeUndefined();
    });

    it('returns undefined when no URL present', () => {
      const email = makeEmail({ body: 'No links here.', html: undefined });
      store.addEmail(email);

      expect(store.extractVerificationLink(email.id)).toBeUndefined();
    });
  });

  // ----------------------------------------------------------------
  // extractOtpCode
  // ----------------------------------------------------------------

  describe('extractOtpCode', () => {
    it('extracts "Your code is 123456"', () => {
      const email = makeEmail({ body: 'Your code is 123456' });
      store.addEmail(email);
      expect(store.extractOtpCode(email.id)).toBe('123456');
    });

    it('extracts "OTP: 7890"', () => {
      const email = makeEmail({ body: 'OTP: 7890' });
      store.addEmail(email);
      expect(store.extractOtpCode(email.id)).toBe('7890');
    });

    it('extracts "verification code: 12345678"', () => {
      const email = makeEmail({ body: 'Your verification code: 12345678' });
      store.addEmail(email);
      expect(store.extractOtpCode(email.id)).toBe('12345678');
    });

    it('extracts code from HTML email', () => {
      const email = makeEmail({
        html: '<p>Your PIN is <strong>5678</strong></p>',
        body: '',
      });
      store.addEmail(email);
      expect(store.extractOtpCode(email.id)).toBe('5678');
    });

    it('extracts "123456 is your code"', () => {
      const email = makeEmail({ body: '123456 is your verification code' });
      store.addEmail(email);
      expect(store.extractOtpCode(email.id)).toBe('123456');
    });

    it('returns undefined for unknown email ID', () => {
      expect(store.extractOtpCode('nope')).toBeUndefined();
    });

    it('returns undefined when no code present', () => {
      const email = makeEmail({ body: 'Welcome aboard!' });
      store.addEmail(email);
      expect(store.extractOtpCode(email.id)).toBeUndefined();
    });
  });

  // ----------------------------------------------------------------
  // clear
  // ----------------------------------------------------------------

  describe('clear', () => {
    it('clears emails for a specific address', () => {
      store.addEmail(makeEmail({ to: 'a@agentpass.dev' }));
      store.addEmail(makeEmail({ to: 'b@agentpass.dev' }));

      store.clear('a@agentpass.dev');

      expect(store.getEmails('a@agentpass.dev')).toEqual([]);
      expect(store.getEmails('b@agentpass.dev')).toHaveLength(1);
    });

    it('clears all emails when no address provided', () => {
      store.addEmail(makeEmail({ to: 'a@agentpass.dev' }));
      store.addEmail(makeEmail({ to: 'b@agentpass.dev' }));

      store.clear();

      expect(store.getEmails('a@agentpass.dev')).toEqual([]);
      expect(store.getEmails('b@agentpass.dev')).toEqual([]);
    });
  });
});
