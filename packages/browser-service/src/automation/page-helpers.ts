import type { Page } from 'playwright';

/** Default navigation / element timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** A field descriptor used by {@link fillForm}. */
export interface FormField {
  /** CSS selector for the input element. */
  selector: string;
  /** Value to type into the field. */
  value: string;
}

/** Result returned by {@link detectCaptcha}. */
export interface CaptchaDetectionResult {
  /** Whether a CAPTCHA element was found on the page. */
  detected: boolean;
  /** The provider, if detected. */
  type?: 'recaptcha' | 'hcaptcha' | 'turnstile';
  /** The CSS selector that matched. */
  selector?: string;
}

/** Known CAPTCHA selectors mapped to their provider type. */
const CAPTCHA_SELECTORS: ReadonlyArray<{
  selector: string;
  type: CaptchaDetectionResult['type'];
}> = [
  { selector: '.g-recaptcha', type: 'recaptcha' },
  { selector: '#g-recaptcha', type: 'recaptcha' },
  { selector: 'iframe[src*="recaptcha"]', type: 'recaptcha' },
  { selector: '.h-captcha', type: 'hcaptcha' },
  { selector: 'iframe[src*="hcaptcha"]', type: 'hcaptcha' },
  { selector: '.cf-turnstile', type: 'turnstile' },
  { selector: 'iframe[src*="challenges.cloudflare.com"]', type: 'turnstile' },
];

/**
 * Navigate to a URL and wait until the network is idle.
 *
 * @param page    — Playwright page instance.
 * @param url     — Target URL.
 * @param timeout — Max wait in ms (default 30 000).
 */
export async function navigate(
  page: Page,
  url: string,
  timeout: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  await page.goto(url, { waitUntil: 'networkidle', timeout });
}

/**
 * Fill multiple form fields by typing into each one.
 *
 * Clicks on the element first to focus it, then types the value character by
 * character so that JS event listeners on the page fire correctly.
 *
 * @param page   — Playwright page instance.
 * @param fields — Array of `{ selector, value }` descriptors.
 */
export async function fillForm(page: Page, fields: FormField[]): Promise<void> {
  for (const field of fields) {
    await page.click(field.selector);
    await page.type(field.selector, field.value);
  }
}

/**
 * Click a button / link and wait for a potential navigation to settle.
 *
 * Uses `Promise.all` with `waitForNavigation` so the click and the navigation
 * race are started simultaneously, avoiding flaky timeout issues.
 *
 * @param page     — Playwright page instance.
 * @param selector — CSS selector of the element to click.
 */
export async function clickButton(page: Page, selector: string): Promise<void> {
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: DEFAULT_TIMEOUT_MS }).catch(
      // Navigation doesn't always happen (e.g. SPA). Swallow the timeout so
      // the caller isn't blocked.
      () => undefined,
    ),
    page.click(selector),
  ]);
}

/**
 * Take a screenshot of the current page.
 *
 * @param page — Playwright page instance.
 * @param path — Optional file path. When omitted the screenshot is returned
 *               as a `Buffer` only (not saved to disk).
 * @returns The screenshot as a `Buffer`.
 */
export async function screenshot(page: Page, path?: string): Promise<Buffer> {
  const options: Parameters<Page['screenshot']>[0] = { fullPage: true };
  if (path) {
    options.path = path;
  }
  return page.screenshot(options) as Promise<Buffer>;
}

/**
 * Wait for an element matching `selector` to appear in the DOM.
 *
 * @param page     — Playwright page instance.
 * @param selector — CSS selector.
 * @param timeout  — Max wait in ms (default 30 000).
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  await page.waitForSelector(selector, { timeout });
}

/**
 * Extract the visible text content from the page body.
 *
 * @param page — Playwright page instance.
 * @returns Plain-text content of `document.body`.
 */
export async function getPageContent(page: Page): Promise<string> {
  return page.innerText('body');
}

/**
 * Detect common CAPTCHA providers on the page.
 *
 * Checks for reCAPTCHA, hCaptcha, and Cloudflare Turnstile by probing known
 * CSS selectors and iframe `src` attributes.
 *
 * @param page — Playwright page instance.
 * @returns Detection result with the matched type and selector when found.
 */
export async function detectCaptcha(page: Page): Promise<CaptchaDetectionResult> {
  for (const entry of CAPTCHA_SELECTORS) {
    const element = await page.$(entry.selector);
    if (element) {
      return { detected: true, type: entry.type, selector: entry.selector };
    }
  }
  return { detected: false };
}
