/**
 * Browser action MCP tools for LLM-driven browser automation.
 *
 * Exposes low-level browser actions (navigate, click, type, etc.) that return
 * screenshots. The calling LLM sees the screenshots, decides what to do next,
 * and calls the next action — forming the agentic loop at zero extra API cost.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Page } from "playwright";
import type { CaptchaService } from "../services/captcha-service.js";
import { z } from "zod";
import {
  BrowserManager,
  type BrowserLaunchOptions,
  screenshot,
  detectCaptcha,
  navigate,
} from "@agentpass/browser-service";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_SETTLE_MS = 500;

// ---------------------------------------------------------------------------
// BrowserSessionManager
// ---------------------------------------------------------------------------

/**
 * Manages a single Playwright browser page for the MCP browser tools.
 *
 * Wraps {@link BrowserManager} from `@agentpass/browser-service` and exposes
 * a persistent page that lives across tool calls within a session.
 */
export class BrowserSessionManager {
  private readonly manager: BrowserManager;
  private readonly launchOptions: BrowserLaunchOptions;
  private page: Page | null = null;
  private passportId: string | null = null;

  constructor(options?: { proxy?: string; headless?: boolean }) {
    this.manager = new BrowserManager();
    this.launchOptions = {
      proxy: options?.proxy,
      headless: options?.headless ?? true,
    };
  }

  /**
   * Set the passport ID for this browser session (used for CAPTCHA escalation).
   */
  setPassportId(id: string): void {
    this.passportId = id;
  }

  /**
   * Get the passport ID associated with this browser session.
   */
  getPassportId(): string | null {
    return this.passportId;
  }

  /**
   * Get or create the active page. Launches the browser on first call.
   */
  async getPage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }
    if (!this.manager.isRunning) {
      await this.manager.launch(this.launchOptions);
    }
    this.page = await this.manager.newPage();
    return this.page;
  }

  /**
   * Check whether a page is currently open.
   */
  get hasPage(): boolean {
    return this.page !== null && !this.page.isClosed();
  }

  /**
   * Take a PNG screenshot of the current page.
   */
  async takeScreenshot(): Promise<Buffer> {
    if (!this.page || this.page.isClosed()) {
      throw new Error("No browser page is open. Call browser_navigate first.");
    }
    return screenshot(this.page);
  }

  /**
   * Run CAPTCHA detection on the current page.
   */
  async detectCaptcha(): Promise<{
    detected: boolean;
    type?: string;
    selector?: string;
  }> {
    if (!this.page || this.page.isClosed()) {
      return { detected: false };
    }
    try {
      return await detectCaptcha(this.page);
    } catch {
      return { detected: false };
    }
  }

  /**
   * Close the page and browser, releasing all resources.
   */
  async close(): Promise<void> {
    if (this.page && !this.page.isClosed()) {
      await this.page.close();
    }
    this.page = null;
    await this.manager.close();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract the domain from a URL for use as the service identifier.
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

/**
 * Build the standard tool response: screenshot image + JSON metadata.
 *
 * When a CAPTCHA is detected and a CaptchaService is provided, automatically
 * escalates to the owner (screenshot + webhook notification) and includes the
 * escalation_id in the response so the LLM can poll for resolution.
 */
async function buildResponse(
  session: BrowserSessionManager,
  captchaService?: CaptchaService,
) {
  const page = await session.getPage();
  const screenshotBuf = await session.takeScreenshot();
  const captcha = await session.detectCaptcha();

  let escalationId: string | null = null;

  if (captcha.detected && captchaService) {
    try {
      const result = await captchaService.escalate(
        session.getPassportId() ?? "unknown",
        extractDomain(page.url()),
        captcha.type ?? "unknown",
        screenshotBuf,
      );
      escalationId = result.escalation_id;

      // Start live browser session so owner can interact via dashboard
      const browserSessionService =
        captchaService.getBrowserSessionService();
      if (browserSessionService && escalationId) {
        try {
          await browserSessionService.startSession(escalationId, page);
        } catch (err) {
          console.warn(
            "[Browser] Failed to start live session:",
            err,
          );
        }
      }
    } catch {
      // Escalation failure is non-critical — still return the screenshot
    }
  }

  return {
    content: [
      {
        type: "image" as const,
        data: screenshotBuf.toString("base64"),
        mimeType: "image/png" as const,
      },
      {
        type: "text" as const,
        text: JSON.stringify({
          url: page.url(),
          title: await page.title(),
          captcha_detected: captcha.detected,
          captcha_type: captcha.type ?? null,
          escalation_id: escalationId,
        }),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerBrowserTools(
  server: McpServer,
  session: BrowserSessionManager,
  captchaService?: CaptchaService,
): void {
  // ── browser_navigate ────────────────────────────────────────────────
  server.tool(
    "browser_navigate",
    "Open browser and navigate to a URL. Returns a screenshot of the loaded page.",
    {
      url: z.string().url().describe("The URL to navigate to"),
      passport_id: z
        .string()
        .regex(/^ap_[a-z0-9]{12}$/)
        .optional()
        .describe(
          "The agent's passport ID. When provided, associates this browser session with the passport for CAPTCHA escalation.",
        ),
    },
    async ({ url, passport_id }) => {
      if (passport_id) {
        session.setPassportId(passport_id);
      }
      const page = await session.getPage();
      await navigate(page, url);
      return buildResponse(session, captchaService);
    },
  );

  // ── browser_click ───────────────────────────────────────────────────
  server.tool(
    "browser_click",
    "Click at the given (x, y) coordinates on the page. Returns a screenshot after the click.",
    {
      x: z.number().describe("X coordinate to click"),
      y: z.number().describe("Y coordinate to click"),
    },
    async ({ x, y }) => {
      const page = await session.getPage();
      await page.mouse.click(x, y);
      await sleep(ACTION_SETTLE_MS);
      try {
        await page.waitForLoadState("domcontentloaded", { timeout: 3000 });
      } catch {
        // Page may already be loaded
      }
      return buildResponse(session, captchaService);
    },
  );

  // ── browser_type ────────────────────────────────────────────────────
  server.tool(
    "browser_type",
    "Type text into the currently focused element. Returns a screenshot after typing.",
    {
      text: z.string().describe("Text to type"),
    },
    async ({ text }) => {
      const page = await session.getPage();
      await page.keyboard.type(text, { delay: 30 });
      await sleep(ACTION_SETTLE_MS);
      return buildResponse(session, captchaService);
    },
  );

  // ── browser_key ─────────────────────────────────────────────────────
  server.tool(
    "browser_key",
    "Press a keyboard key (Enter, Tab, Escape, Backspace, etc.). Returns a screenshot.",
    {
      key: z
        .string()
        .describe(
          'Key to press (e.g. "Enter", "Tab", "Escape", "Backspace", "ArrowDown")',
        ),
    },
    async ({ key }) => {
      const page = await session.getPage();
      await page.keyboard.press(key);
      await sleep(ACTION_SETTLE_MS);
      try {
        await page.waitForLoadState("domcontentloaded", { timeout: 3000 });
      } catch {
        // Page may already be loaded
      }
      return buildResponse(session, captchaService);
    },
  );

  // ── browser_scroll ──────────────────────────────────────────────────
  server.tool(
    "browser_scroll",
    "Scroll the page up or down. Returns a screenshot after scrolling.",
    {
      direction: z.enum(["up", "down"]).describe("Scroll direction"),
      amount: z
        .number()
        .optional()
        .default(3)
        .describe("Number of scroll increments (default 3)"),
    },
    async ({ direction, amount }) => {
      const page = await session.getPage();
      const delta = (amount ?? 3) * 100;
      const deltaY = direction === "down" ? delta : -delta;
      await page.mouse.wheel(0, deltaY);
      await sleep(ACTION_SETTLE_MS);
      return buildResponse(session, captchaService);
    },
  );

  // ── browser_screenshot ──────────────────────────────────────────────
  server.tool(
    "browser_screenshot",
    "Take a screenshot of the current page without performing any action.",
    {},
    async () => {
      return buildResponse(session, captchaService);
    },
  );

  // ── browser_close ───────────────────────────────────────────────────
  server.tool(
    "browser_close",
    "Close the browser page and release all resources.",
    {},
    async () => {
      await session.close();
      return {
        content: [
          {
            type: "text" as const,
            text: "Browser closed successfully.",
          },
        ],
      };
    },
  );
}
