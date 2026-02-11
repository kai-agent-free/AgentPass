import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page } from 'playwright';

import { registerOnService, type RegistrationOptions } from './registration.js';

// ---------------------------------------------------------------------------
// Mock page factory
// ---------------------------------------------------------------------------

interface MockPageOverrides {
  goto?: ReturnType<typeof vi.fn>;
  click?: ReturnType<typeof vi.fn>;
  type?: ReturnType<typeof vi.fn>;
  waitForNavigation?: ReturnType<typeof vi.fn>;
  waitForTimeout?: ReturnType<typeof vi.fn>;
  waitForSelector?: ReturnType<typeof vi.fn>;
  screenshot?: ReturnType<typeof vi.fn>;
  innerText?: ReturnType<typeof vi.fn>;
  $?: ReturnType<typeof vi.fn>;
  url?: ReturnType<typeof vi.fn>;
}

function createMockPage(overrides?: MockPageOverrides): Page {
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    waitForNavigation: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-screenshot')),
    innerText: vi.fn().mockResolvedValue(''),
    $: vi.fn().mockResolvedValue(null),
    url: vi.fn().mockReturnValue('https://example.com/signup'),
    ...overrides,
  } as unknown as Page;
  return page;
}

const BASE_OPTIONS: RegistrationOptions = {
  url: 'https://example.com/signup',
  email: 'agent@example.com',
  password: 'SuperSecure123!',
  name: 'Agent Smith',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerOnService', () => {
  let page: Page;

  beforeEach(() => {
    page = createMockPage();
  });

  // -----------------------------------------------------------------------
  // Successful flow
  // -----------------------------------------------------------------------

  it('completes registration when all form fields and submit button are found', async () => {
    const selectorMap: Record<string, boolean> = {
      'input[type="email"]': true,
      'input[type="password"]': true,
      'input[name="name"]': true,
      'button[type="submit"]': true,
    };

    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(selectorMap[sel] ? {} : null),
      ),
    });

    const result = await registerOnService(page, BASE_OPTIONS);

    expect(result.success).toBe(true);
    expect(result.credentials).toEqual({
      username: 'Agent Smith',
      password: 'SuperSecure123!',
      email: 'agent@example.com',
    });
    expect(result.captcha_detected).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('uses email as username when name is not provided', async () => {
    const selectorMap: Record<string, boolean> = {
      'input[type="email"]': true,
      'input[type="password"]': true,
      'button[type="submit"]': true,
    };

    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(selectorMap[sel] ? {} : null),
      ),
    });

    const result = await registerOnService(page, {
      url: 'https://example.com/signup',
      email: 'agent@example.com',
      password: 'SuperSecure123!',
    });

    expect(result.success).toBe(true);
    expect(result.credentials?.username).toBe('agent@example.com');
  });

  // -----------------------------------------------------------------------
  // CAPTCHA detection (before form fill)
  // -----------------------------------------------------------------------

  it('returns early with captcha_detected when CAPTCHA is found before filling', async () => {
    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) => {
        if (sel === '.g-recaptcha') return Promise.resolve({});
        return Promise.resolve(null);
      }),
    });

    const result = await registerOnService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.captcha_detected).toBe(true);
    expect(result.captcha_type).toBe('recaptcha');
    expect(result.error).toContain('CAPTCHA detected');
    expect(result.screenshot).toBeInstanceOf(Buffer);
    // Form should NOT have been filled — click and type should not be called.
    expect(page.click).not.toHaveBeenCalled();
    expect(page.type).not.toHaveBeenCalled();
  });

  it('detects hCaptcha and returns the correct type', async () => {
    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) => {
        if (sel === '.h-captcha') return Promise.resolve({});
        return Promise.resolve(null);
      }),
    });

    const result = await registerOnService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.captcha_detected).toBe(true);
    expect(result.captcha_type).toBe('hcaptcha');
  });

  // -----------------------------------------------------------------------
  // CAPTCHA detection (after submit)
  // -----------------------------------------------------------------------

  it('detects CAPTCHA that appears after form submission', async () => {
    let callCount = 0;

    // On the first pass (7 CAPTCHA selectors) return null.
    // After submit (second pass) return a match for turnstile.
    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) => {
        if (sel === 'input[type="email"]' || sel === 'input[type="password"]' || sel === 'button[type="submit"]') {
          return Promise.resolve({});
        }
        // CAPTCHA selectors
        if (sel === '.cf-turnstile') {
          callCount++;
          // First call during pre-fill check: not detected
          // Second call during post-submit check: detected
          if (callCount >= 2) {
            return Promise.resolve({});
          }
        }
        return Promise.resolve(null);
      }),
    });

    const result = await registerOnService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.captcha_detected).toBe(true);
    expect(result.captcha_type).toBe('turnstile');
    expect(result.error).toContain('after form submission');
  });

  // -----------------------------------------------------------------------
  // Form field detection — tries multiple selectors
  // -----------------------------------------------------------------------

  it('tries fallback email selectors when the first does not match', async () => {
    const selectorMap: Record<string, boolean> = {
      // 'input[type="email"]' is NOT in the map — it won't match.
      'input[name="email"]': true,     // second candidate
      'input[type="password"]': true,
      'button[type="submit"]': true,
    };

    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(selectorMap[sel] ? {} : null),
      ),
    });

    const result = await registerOnService(page, {
      url: 'https://example.com/signup',
      email: 'agent@example.com',
      password: 'pass123',
    });

    expect(result.success).toBe(true);
    // Verify the correct selector was used for email
    expect(page.click).toHaveBeenCalledWith('input[name="email"]');
    expect(page.type).toHaveBeenCalledWith('input[name="email"]', 'agent@example.com');
  });

  it('tries fallback password selectors when the first does not match', async () => {
    const selectorMap: Record<string, boolean> = {
      'input[type="email"]': true,
      // 'input[type="password"]' is NOT in the map.
      'input[name="password"]': true,  // second candidate
      'button[type="submit"]': true,
    };

    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(selectorMap[sel] ? {} : null),
      ),
    });

    const result = await registerOnService(page, {
      url: 'https://example.com/signup',
      email: 'agent@example.com',
      password: 'pass123',
    });

    expect(result.success).toBe(true);
    expect(page.click).toHaveBeenCalledWith('input[name="password"]');
  });

  it('tries text-based submit selectors when CSS selectors do not match', async () => {
    const selectorMap: Record<string, boolean> = {
      'input[type="email"]': true,
      'input[type="password"]': true,
      // Neither button[type="submit"] nor input[type="submit"] match.
      'button:has-text("sign up")': true,
    };

    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(selectorMap[sel] ? {} : null),
      ),
    });

    const result = await registerOnService(page, {
      url: 'https://example.com/signup',
      email: 'agent@example.com',
      password: 'pass123',
    });

    expect(result.success).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Missing form elements
  // -----------------------------------------------------------------------

  it('returns error when email input cannot be found', async () => {
    // Only password and submit exist — no email field.
    const selectorMap: Record<string, boolean> = {
      'input[type="password"]': true,
      'button[type="submit"]': true,
    };

    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(selectorMap[sel] ? {} : null),
      ),
    });

    const result = await registerOnService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.error).toContain('email');
    expect(result.screenshot).toBeInstanceOf(Buffer);
  });

  it('returns error when password input cannot be found', async () => {
    const selectorMap: Record<string, boolean> = {
      'input[type="email"]': true,
      'button[type="submit"]': true,
    };

    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(selectorMap[sel] ? {} : null),
      ),
    });

    const result = await registerOnService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.error).toContain('password');
  });

  it('returns error when submit button cannot be found', async () => {
    const selectorMap: Record<string, boolean> = {
      'input[type="email"]': true,
      'input[type="password"]': true,
      // No submit selector matches at all.
    };

    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(selectorMap[sel] ? {} : null),
      ),
    });

    const result = await registerOnService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.error).toContain('submit');
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it('catches navigation errors and returns a failure result', async () => {
    page = createMockPage({
      goto: vi.fn().mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED')),
    });

    const result = await registerOnService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.error).toContain('net::ERR_CONNECTION_REFUSED');
  });

  it('includes a screenshot in the error result when possible', async () => {
    page = createMockPage({
      goto: vi.fn().mockRejectedValue(new Error('Timeout')),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('error-shot')),
    });

    const result = await registerOnService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.screenshot).toBeInstanceOf(Buffer);
  });

  it('handles screenshot failure gracefully during error handling', async () => {
    page = createMockPage({
      goto: vi.fn().mockRejectedValue(new Error('Timeout')),
      screenshot: vi.fn().mockRejectedValue(new Error('Page crashed')),
    });

    const result = await registerOnService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.screenshot).toBeUndefined();
  });
});
