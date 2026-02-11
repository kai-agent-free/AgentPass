import type { Page } from 'playwright';

import {
  navigate,
  fillForm,
  clickButton,
  screenshot,
  detectCaptcha,
  type FormField,
} from '../automation/index.js';

/** Options required to attempt registration on a service. */
export interface RegistrationOptions {
  /** The signup/registration page URL. */
  url: string;
  /** Email address to register with. */
  email: string;
  /** Password for the new account. */
  password: string;
  /** Optional display name or username. */
  name?: string;
}

/** Outcome of a registration attempt. */
export interface RegistrationResult {
  /** Whether the registration completed without blocking issues. */
  success: boolean;
  /** Credentials that were submitted, present on success. */
  credentials?: {
    username: string;
    password: string;
    email: string;
  };
  /** True when a CAPTCHA was detected before submission. */
  captcha_detected?: boolean;
  /** The CAPTCHA provider when detected. */
  captcha_type?: string;
  /** Human-readable error description. */
  error?: string;
  /** Screenshot captured at the point of failure or CAPTCHA detection. */
  screenshot?: Buffer;
}

// ---------------------------------------------------------------------------
// Selector lists — tried in order until one resolves on the page.
// ---------------------------------------------------------------------------

const EMAIL_SELECTORS = [
  'input[type="email"]',
  'input[name="email"]',
  '#email',
  'input[placeholder*="email" i]',
] as const;

const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[name="password"]',
  '#password',
] as const;

const NAME_SELECTORS = [
  'input[name="name"]',
  'input[name="username"]',
  '#name',
  '#username',
  'input[name="fullname"]',
  'input[name="full_name"]',
  'input[placeholder*="name" i]',
] as const;

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
] as const;

/** Text patterns matched against visible button text (case-insensitive). */
const SUBMIT_TEXT_PATTERNS = ['sign up', 'register', 'create account', 'create'] as const;

/** Timeout for waiting on post-submit navigation / response (ms). */
const POST_SUBMIT_WAIT_MS = 5_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the first selector in `candidates` that matches an element on `page`.
 *
 * @returns The matching CSS selector, or `null` when none match.
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
 * Locate a submit / signup button on the page.
 *
 * First tries well-known CSS selectors, then falls back to text-matching
 * against common signup button labels.
 */
async function resolveSubmitSelector(page: Page): Promise<string | null> {
  // 1. Try standard submit selectors.
  const cssMatch = await resolveSelector(page, SUBMIT_SELECTORS);
  if (cssMatch) {
    return cssMatch;
  }

  // 2. Try text-based matching.
  for (const text of SUBMIT_TEXT_PATTERNS) {
    const selector = `button:has-text("${text}")`;
    const element = await page.$(selector);
    if (element) {
      return selector;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main strategy
// ---------------------------------------------------------------------------

/**
 * Attempt to register a new account on a web service using its signup page.
 *
 * The strategy is intentionally generic: it probes common CSS selectors to
 * locate form fields and submits them.  If a CAPTCHA is detected the function
 * returns early with `captcha_detected: true` so the caller can escalate to
 * the agent owner.
 *
 * @param page    — A Playwright {@link Page} instance (already launched).
 * @param options — Registration details (URL, email, password, optional name).
 * @returns A {@link RegistrationResult} describing the outcome.
 */
export async function registerOnService(
  page: Page,
  options: RegistrationOptions,
): Promise<RegistrationResult> {
  const { url, email, password, name } = options;

  try {
    // 1. Navigate to the signup page.
    await navigate(page, url);

    // 2. Check for CAPTCHAs before attempting to fill anything.
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
    const emailSelector = await resolveSelector(page, EMAIL_SELECTORS);
    if (!emailSelector) {
      const shot = await screenshot(page);
      return {
        success: false,
        error: 'Could not locate email input field on the page',
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

    // 4. Build the list of fields to fill.
    const fields: FormField[] = [];

    // Fill name first if provided and a matching field exists.
    if (name) {
      const nameSelector = await resolveSelector(page, NAME_SELECTORS);
      if (nameSelector) {
        fields.push({ selector: nameSelector, value: name });
      }
    }

    fields.push({ selector: emailSelector, value: email });
    fields.push({ selector: passwordSelector, value: password });

    await fillForm(page, fields);

    // 5. Locate and click the submit button.
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

    // 6. Brief pause to allow the page to settle after submission.
    await page.waitForTimeout(POST_SUBMIT_WAIT_MS);

    // 7. Check for CAPTCHA that may have appeared after submit.
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

    return {
      success: true,
      credentials: {
        username: name ?? email,
        password,
        email,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    let shot: Buffer | undefined;
    try {
      shot = await screenshot(page);
    } catch {
      // Screenshot itself may fail if the page crashed.
    }

    return {
      success: false,
      error: `Registration failed: ${message}`,
      screenshot: shot,
    };
  }
}
