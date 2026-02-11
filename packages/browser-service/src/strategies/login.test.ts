import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page } from 'playwright';

import { loginToService, type LoginOptions } from './login.js';

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
    innerText: vi.fn().mockResolvedValue('Welcome to your dashboard'),
    $: vi.fn().mockResolvedValue(null),
    url: vi.fn().mockReturnValue('https://example.com/login'),
    ...overrides,
  } as unknown as Page;
  return page;
}

const BASE_OPTIONS: LoginOptions = {
  url: 'https://example.com/login',
  username: 'agent@example.com',
  password: 'SuperSecure123!',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loginToService', () => {
  let page: Page;

  beforeEach(() => {
    page = createMockPage();
  });

  // -----------------------------------------------------------------------
  // Successful flow
  // -----------------------------------------------------------------------

  it('completes login when form fields and submit button are found and URL changes', async () => {
    let urlCallCount = 0;

    const selectorMap: Record<string, boolean> = {
      'input[type="email"]': true,
      'input[type="password"]': true,
      'button[type="submit"]': true,
    };

    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(selectorMap[sel] ? {} : null),
      ),
      url: vi.fn().mockImplementation(() => {
        urlCallCount++;
        // First call: initial URL (captured before submit)
        // Subsequent calls: post-login URL (different)
        return urlCallCount <= 1
          ? 'https://example.com/login'
          : 'https://example.com/dashboard';
      }),
      innerText: vi.fn().mockResolvedValue('Welcome to your dashboard'),
    });

    const result = await loginToService(page, BASE_OPTIONS);

    expect(result.success).toBe(true);
    expect(result.captcha_detected).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('considers login successful when URL does not change but no error is visible', async () => {
    // SPA-style login: URL stays the same.
    const selectorMap: Record<string, boolean> = {
      'input[type="email"]': true,
      'input[type="password"]': true,
      'button[type="submit"]': true,
    };

    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(selectorMap[sel] ? {} : null),
      ),
      url: vi.fn().mockReturnValue('https://example.com/login'), // never changes
      innerText: vi.fn().mockResolvedValue('Welcome back!'),
    });

    const result = await loginToService(page, BASE_OPTIONS);

    expect(result.success).toBe(true);
  });

  // -----------------------------------------------------------------------
  // CAPTCHA detection
  // -----------------------------------------------------------------------

  it('returns early with captcha_detected when CAPTCHA is found before filling', async () => {
    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) => {
        if (sel === '.h-captcha') return Promise.resolve({});
        return Promise.resolve(null);
      }),
    });

    const result = await loginToService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.captcha_detected).toBe(true);
    expect(result.captcha_type).toBe('hcaptcha');
    expect(result.error).toContain('CAPTCHA detected');
    expect(result.screenshot).toBeInstanceOf(Buffer);
    // Form should NOT have been filled.
    expect(page.click).not.toHaveBeenCalled();
    expect(page.type).not.toHaveBeenCalled();
  });

  it('detects CAPTCHA that appears after form submission', async () => {
    let turnstileCallCount = 0;

    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) => {
        if (
          sel === 'input[type="email"]' ||
          sel === 'input[type="password"]' ||
          sel === 'button[type="submit"]'
        ) {
          return Promise.resolve({});
        }
        if (sel === '.cf-turnstile') {
          turnstileCallCount++;
          // Second occurrence: post-submit scan
          if (turnstileCallCount >= 2) {
            return Promise.resolve({});
          }
        }
        return Promise.resolve(null);
      }),
    });

    const result = await loginToService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.captcha_detected).toBe(true);
    expect(result.captcha_type).toBe('turnstile');
    expect(result.error).toContain('after form submission');
  });

  // -----------------------------------------------------------------------
  // Login failure detection
  // -----------------------------------------------------------------------

  it('detects login failure when error message is visible and URL stays the same', async () => {
    const selectorMap: Record<string, boolean> = {
      'input[type="email"]': true,
      'input[type="password"]': true,
      'button[type="submit"]': true,
    };

    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(selectorMap[sel] ? {} : null),
      ),
      url: vi.fn().mockReturnValue('https://example.com/login'),
      innerText: vi.fn().mockResolvedValue('Invalid email or password. Please try again.'),
    });

    const result = await loginToService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.error).toContain('error message detected');
    expect(result.screenshot).toBeInstanceOf(Buffer);
  });

  it('detects login failure when URL changes but error indicators are present', async () => {
    let urlCallCount = 0;
    const selectorMap: Record<string, boolean> = {
      'input[type="email"]': true,
      'input[type="password"]': true,
      'button[type="submit"]': true,
    };

    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(selectorMap[sel] ? {} : null),
      ),
      url: vi.fn().mockImplementation(() => {
        urlCallCount++;
        return urlCallCount <= 1
          ? 'https://example.com/login'
          : 'https://example.com/login?error=1';
      }),
      innerText: vi.fn().mockResolvedValue('Authentication failed. Wrong password.'),
    });

    const result = await loginToService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.error).toContain('error message detected');
  });

  // -----------------------------------------------------------------------
  // Form field resolution
  // -----------------------------------------------------------------------

  it('tries fallback username selectors when the first does not match', async () => {
    const selectorMap: Record<string, boolean> = {
      // 'input[type="email"]' does NOT match.
      'input[name="email"]': true,     // second candidate
      'input[type="password"]': true,
      'button[type="submit"]': true,
    };

    let urlCallCount = 0;
    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(selectorMap[sel] ? {} : null),
      ),
      url: vi.fn().mockImplementation(() => {
        urlCallCount++;
        return urlCallCount <= 1
          ? 'https://example.com/login'
          : 'https://example.com/dashboard';
      }),
      innerText: vi.fn().mockResolvedValue('Dashboard'),
    });

    const result = await loginToService(page, BASE_OPTIONS);

    expect(result.success).toBe(true);
    expect(page.click).toHaveBeenCalledWith('input[name="email"]');
    expect(page.type).toHaveBeenCalledWith('input[name="email"]', 'agent@example.com');
  });

  it('uses text-based submit button fallback', async () => {
    const selectorMap: Record<string, boolean> = {
      'input[type="email"]': true,
      'input[type="password"]': true,
      // No CSS submit selectors match.
      'button:has-text("log in")': true,
    };

    let urlCallCount = 0;
    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(selectorMap[sel] ? {} : null),
      ),
      url: vi.fn().mockImplementation(() => {
        urlCallCount++;
        return urlCallCount <= 1
          ? 'https://example.com/login'
          : 'https://example.com/dashboard';
      }),
      innerText: vi.fn().mockResolvedValue('Dashboard'),
    });

    const result = await loginToService(page, BASE_OPTIONS);

    expect(result.success).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Missing form elements
  // -----------------------------------------------------------------------

  it('returns error when username input cannot be found', async () => {
    // Only password exists.
    const selectorMap: Record<string, boolean> = {
      'input[type="password"]': true,
      'button[type="submit"]': true,
    };

    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(selectorMap[sel] ? {} : null),
      ),
    });

    const result = await loginToService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.error).toContain('username');
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

    const result = await loginToService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.error).toContain('password');
  });

  it('returns error when submit button cannot be found', async () => {
    const selectorMap: Record<string, boolean> = {
      'input[type="email"]': true,
      'input[type="password"]': true,
    };

    page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(selectorMap[sel] ? {} : null),
      ),
    });

    const result = await loginToService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.error).toContain('submit');
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it('catches navigation errors and returns a failure result', async () => {
    page = createMockPage({
      goto: vi.fn().mockRejectedValue(new Error('net::ERR_NAME_NOT_RESOLVED')),
    });

    const result = await loginToService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.error).toContain('net::ERR_NAME_NOT_RESOLVED');
  });

  it('includes a screenshot in the error result when possible', async () => {
    page = createMockPage({
      goto: vi.fn().mockRejectedValue(new Error('Timeout')),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('error-shot')),
    });

    const result = await loginToService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.screenshot).toBeInstanceOf(Buffer);
  });

  it('handles screenshot failure gracefully during error handling', async () => {
    page = createMockPage({
      goto: vi.fn().mockRejectedValue(new Error('Timeout')),
      screenshot: vi.fn().mockRejectedValue(new Error('Page crashed')),
    });

    const result = await loginToService(page, BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.screenshot).toBeUndefined();
  });
});
