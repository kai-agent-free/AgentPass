import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page } from 'playwright';
import { detectCaptcha, fillForm, navigate, clickButton, screenshot, waitForElement, getPageContent } from './page-helpers.js';

/**
 * Creates a minimal mock of a Playwright Page with the methods used by
 * page-helpers. Every method is a vi.fn() so callers can assert on calls.
 */
function createMockPage(overrides?: Partial<Record<keyof Page, unknown>>): Page {
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    waitForNavigation: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    innerText: vi.fn().mockResolvedValue('page text'),
    $: vi.fn().mockResolvedValue(null), // default: nothing found
    ...overrides,
  } as unknown as Page;
  return page;
}

// ---------------------------------------------------------------------------
// detectCaptcha
// ---------------------------------------------------------------------------
describe('detectCaptcha', () => {
  it('returns detected: false when no CAPTCHA elements exist', async () => {
    const page = createMockPage();
    const result = await detectCaptcha(page);

    expect(result).toEqual({ detected: false });
  });

  it('detects reCAPTCHA via .g-recaptcha selector', async () => {
    const page = createMockPage({
      $: vi.fn().mockImplementation((selector: string) => {
        if (selector === '.g-recaptcha') return Promise.resolve({});
        return Promise.resolve(null);
      }),
    });

    const result = await detectCaptcha(page);

    expect(result.detected).toBe(true);
    expect(result.type).toBe('recaptcha');
    expect(result.selector).toBe('.g-recaptcha');
  });

  it('detects hCaptcha via .h-captcha selector', async () => {
    const page = createMockPage({
      $: vi.fn().mockImplementation((selector: string) => {
        if (selector === '.h-captcha') return Promise.resolve({});
        return Promise.resolve(null);
      }),
    });

    const result = await detectCaptcha(page);

    expect(result.detected).toBe(true);
    expect(result.type).toBe('hcaptcha');
    expect(result.selector).toBe('.h-captcha');
  });

  it('detects Cloudflare Turnstile via .cf-turnstile selector', async () => {
    const page = createMockPage({
      $: vi.fn().mockImplementation((selector: string) => {
        if (selector === '.cf-turnstile') return Promise.resolve({});
        return Promise.resolve(null);
      }),
    });

    const result = await detectCaptcha(page);

    expect(result.detected).toBe(true);
    expect(result.type).toBe('turnstile');
    expect(result.selector).toBe('.cf-turnstile');
  });

  it('detects reCAPTCHA via iframe src attribute', async () => {
    const page = createMockPage({
      $: vi.fn().mockImplementation((selector: string) => {
        if (selector === 'iframe[src*="recaptcha"]') return Promise.resolve({});
        return Promise.resolve(null);
      }),
    });

    const result = await detectCaptcha(page);

    expect(result.detected).toBe(true);
    expect(result.type).toBe('recaptcha');
    expect(result.selector).toBe('iframe[src*="recaptcha"]');
  });

  it('returns the first match when multiple CAPTCHAs exist', async () => {
    // .g-recaptcha comes before .h-captcha in the selector list
    const page = createMockPage({
      $: vi.fn().mockResolvedValue({}), // everything matches
    });

    const result = await detectCaptcha(page);

    expect(result.detected).toBe(true);
    expect(result.type).toBe('recaptcha');
    expect(result.selector).toBe('.g-recaptcha');
  });
});

// ---------------------------------------------------------------------------
// fillForm
// ---------------------------------------------------------------------------
describe('fillForm', () => {
  let page: Page;

  beforeEach(() => {
    page = createMockPage();
  });

  it('clicks and types into each field in order', async () => {
    const fields = [
      { selector: '#email', value: 'agent@example.com' },
      { selector: '#password', value: 's3cret!' },
    ];

    await fillForm(page, fields);

    expect(page.click).toHaveBeenCalledTimes(2);
    expect(page.type).toHaveBeenCalledTimes(2);

    expect(page.click).toHaveBeenNthCalledWith(1, '#email');
    expect(page.type).toHaveBeenNthCalledWith(1, '#email', 'agent@example.com');

    expect(page.click).toHaveBeenNthCalledWith(2, '#password');
    expect(page.type).toHaveBeenNthCalledWith(2, '#password', 's3cret!');
  });

  it('handles an empty fields array without error', async () => {
    await fillForm(page, []);

    expect(page.click).not.toHaveBeenCalled();
    expect(page.type).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// navigate
// ---------------------------------------------------------------------------
describe('navigate', () => {
  it('calls page.goto with networkidle and default timeout', async () => {
    const page = createMockPage();

    await navigate(page, 'https://example.com');

    expect(page.goto).toHaveBeenCalledWith('https://example.com', {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
  });

  it('respects a custom timeout', async () => {
    const page = createMockPage();

    await navigate(page, 'https://example.com', 60_000);

    expect(page.goto).toHaveBeenCalledWith('https://example.com', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });
  });
});

// ---------------------------------------------------------------------------
// clickButton
// ---------------------------------------------------------------------------
describe('clickButton', () => {
  it('clicks the selector and waits for navigation', async () => {
    const page = createMockPage();

    await clickButton(page, '#submit');

    expect(page.click).toHaveBeenCalledWith('#submit');
    expect(page.waitForNavigation).toHaveBeenCalled();
  });

  it('does not throw when navigation times out (SPA)', async () => {
    const page = createMockPage({
      waitForNavigation: vi.fn().mockRejectedValue(new Error('Timeout')),
    });

    // Should not throw
    await clickButton(page, '#submit');

    expect(page.click).toHaveBeenCalledWith('#submit');
  });
});

// ---------------------------------------------------------------------------
// screenshot
// ---------------------------------------------------------------------------
describe('screenshot', () => {
  it('returns a Buffer with fullPage enabled', async () => {
    const page = createMockPage();

    const result = await screenshot(page);

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(page.screenshot).toHaveBeenCalledWith({ fullPage: true });
  });

  it('passes the path option when provided', async () => {
    const page = createMockPage();

    await screenshot(page, '/tmp/shot.png');

    expect(page.screenshot).toHaveBeenCalledWith({
      fullPage: true,
      path: '/tmp/shot.png',
    });
  });
});

// ---------------------------------------------------------------------------
// waitForElement
// ---------------------------------------------------------------------------
describe('waitForElement', () => {
  it('calls waitForSelector with default timeout', async () => {
    const page = createMockPage();

    await waitForElement(page, '.success-banner');

    expect(page.waitForSelector).toHaveBeenCalledWith('.success-banner', {
      timeout: 30_000,
    });
  });

  it('respects a custom timeout', async () => {
    const page = createMockPage();

    await waitForElement(page, '.verify-link', 60_000);

    expect(page.waitForSelector).toHaveBeenCalledWith('.verify-link', {
      timeout: 60_000,
    });
  });
});

// ---------------------------------------------------------------------------
// getPageContent
// ---------------------------------------------------------------------------
describe('getPageContent', () => {
  it('returns the inner text of the body', async () => {
    const page = createMockPage({
      innerText: vi.fn().mockResolvedValue('Hello World'),
    });

    const text = await getPageContent(page);

    expect(text).toBe('Hello World');
    expect(page.innerText).toHaveBeenCalledWith('body');
  });
});
