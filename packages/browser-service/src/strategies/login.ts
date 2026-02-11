import type { Page } from 'playwright';

import {
  navigate,
  fillForm,
  clickButton,
  screenshot,
  detectCaptcha,
  getPageContent,
  type FormField,
} from '../automation/index.js';

/** Options required to attempt login on a service. */
export interface LoginOptions {
  /** The login page URL. */
  url: string;
  /** Username or email to log in with. */
  username: string;
  /** Account password. */
  password: string;
}

/** Outcome of a login attempt. */
export interface LoginResult {
  /** Whether the login appears to have succeeded. */
  success: boolean;
  /** True when a CAPTCHA was detected during the flow. */
  captcha_detected?: boolean;
  /** The CAPTCHA provider when detected. */
  captcha_type?: string;
  /** Human-readable error description. */
  error?: string;
  /** Screenshot captured at the point of failure or CAPTCHA detection. */
  screenshot?: Buffer;
}

// ---------------------------------------------------------------------------
// Selector lists
// ---------------------------------------------------------------------------

const USERNAME_SELECTORS = [
  'input[type="email"]',
  'input[name="email"]',
  'input[name="username"]',
  '#email',
  '#username',
  'input[name="login"]',
  'input[placeholder*="email" i]',
  'input[placeholder*="username" i]',
] as const;

const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[name="password"]',
  '#password',
] as const;

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
] as const;

/** Text patterns matched against visible button text (case-insensitive). */
const SUBMIT_TEXT_PATTERNS = ['log in', 'login', 'sign in', 'signin', 'submit'] as const;

/** Timeout for waiting on post-submit navigation / response (ms). */
const POST_SUBMIT_WAIT_MS = 5_000;

/** Error message fragments that suggest login failure. */
const ERROR_INDICATORS = [
  'invalid',
  'incorrect',
  'wrong password',
  'authentication failed',
  'login failed',
  'try again',
  'does not match',
  'not found',
  'unauthorized',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the first selector in `candidates` that matches an element on `page`.
 */
async function resolveSelector(page: Page, candidates: readonly string[]): Promise<string | null> {
  for (const selector of candidates) {
    const element = await page.$(selector);
    if (element) {
      return selector;
    }
  }
  return null;
}

/**
 * Locate a login / submit button on the page.
 */
async function resolveSubmitSelector(page: Page): Promise<string | null> {
  const cssMatch = await resolveSelector(page, SUBMIT_SELECTORS);
  if (cssMatch) {
    return cssMatch;
  }

  for (const text of SUBMIT_TEXT_PATTERNS) {
    const selector = `button:has-text("${text}")`;
    const element = await page.$(selector);
    if (element) {
      return selector;
    }
  }

  return null;
}

/**
 * Heuristically check whether the page shows a login error message.
 *
 * Searches the visible body text for known error-indicating phrases.
 */
async function hasErrorMessage(page: Page): Promise<boolean> {
  try {
    const content = await getPageContent(page);
    const lower = content.toLowerCase();
    return ERROR_INDICATORS.some((indicator) => lower.includes(indicator));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main strategy
// ---------------------------------------------------------------------------

/**
 * Attempt to log into a web service using its login page.
 *
 * Like {@link registerOnService}, the strategy is generic and probes common
 * CSS selectors.  After submission it checks URL changes and error indicators
 * to determine whether the login succeeded.
 *
 * @param page    — A Playwright {@link Page} instance (already launched).
 * @param options — Login details (URL, username / email, password).
 * @returns A {@link LoginResult} describing the outcome.
 */
export async function loginToService(
  page: Page,
  options: LoginOptions,
): Promise<LoginResult> {
  const { url, username, password } = options;

  try {
    // 1. Navigate to the login page.
    await navigate(page, url);

    const initialUrl = page.url();

    // 2. Check for CAPTCHA before filling anything.
    const captcha = await detectCaptcha(page);
    if (captcha.detected) {
      const shot = await screenshot(page);
      return {
        success: false,
        captcha_detected: true,
        captcha_type: captcha.type,
        error: `CAPTCHA detected (${captcha.type ?? 'unknown'}) — manual intervention required`,
        screenshot: shot,
      };
    }

    // 3. Resolve form field selectors.
    const usernameSelector = await resolveSelector(page, USERNAME_SELECTORS);
    if (!usernameSelector) {
      const shot = await screenshot(page);
      return {
        success: false,
        error: 'Could not locate username/email input field on the page',
        screenshot: shot,
      };
    }

    const passwordSelector = await resolveSelector(page, PASSWORD_SELECTORS);
    if (!passwordSelector) {
      const shot = await screenshot(page);
      return {
        success: false,
        error: 'Could not locate password input field on the page',
        screenshot: shot,
      };
    }

    // 4. Fill the login form.
    const fields: FormField[] = [
      { selector: usernameSelector, value: username },
      { selector: passwordSelector, value: password },
    ];

    await fillForm(page, fields);

    // 5. Locate and click submit.
    const submitSelector = await resolveSubmitSelector(page);
    if (!submitSelector) {
      const shot = await screenshot(page);
      return {
        success: false,
        error: 'Could not locate submit button on the page',
        screenshot: shot,
      };
    }

    await clickButton(page, submitSelector);

    // 6. Brief wait for the page to settle.
    await page.waitForTimeout(POST_SUBMIT_WAIT_MS);

    // 7. Post-submit CAPTCHA check.
    const postCaptcha = await detectCaptcha(page);
    if (postCaptcha.detected) {
      const shot = await screenshot(page);
      return {
        success: false,
        captcha_detected: true,
        captcha_type: postCaptcha.type,
        error: `CAPTCHA appeared after form submission (${postCaptcha.type ?? 'unknown'})`,
        screenshot: shot,
      };
    }

    // 8. Determine success heuristics.
    const currentUrl = page.url();
    const urlChanged = currentUrl !== initialUrl;

    // If the URL changed and no error message is visible we assume success.
    if (urlChanged) {
      const hasError = await hasErrorMessage(page);
      if (!hasError) {
        return { success: true };
      }
    }

    // If the URL did NOT change, check for error messages.
    const hasError = await hasErrorMessage(page);
    if (hasError) {
      const shot = await screenshot(page);
      return {
        success: false,
        error: 'Login appears to have failed — error message detected on the page',
        screenshot: shot,
      };
    }

    // URL didn't change but no error visible either — optimistic success
    // (some SPAs update state without changing the URL).
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    let shot: Buffer | undefined;
    try {
      shot = await screenshot(page);
    } catch {
      // Screenshot itself may fail.
    }

    return {
      success: false,
      error: `Login failed: ${message}`,
      screenshot: shot,
    };
  }
}
